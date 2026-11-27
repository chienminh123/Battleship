using System.Text.Json.Serialization;
using Battleship.Server;
using Battleship.Server.Data;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.SignalR;

var builder = WebApplication.CreateBuilder(args);

var storage = Path.GetFullPath(builder.Configuration["Storage:Directory"] ?? Path.Combine(builder.Environment.ContentRootPath, "App_Data"));
Directory.CreateDirectory(storage);
Directory.CreateDirectory(Path.Combine(storage, "keys"));
builder.Services.AddDataProtection().SetApplicationName("Battleship").PersistKeysToFileSystem(new DirectoryInfo(Path.Combine(storage, "keys")));
builder.Services.AddDbContext<AppDb>(options => options.UseSqlite(builder.Configuration.GetConnectionString("Accounts") ?? $"Data Source={Path.Combine(storage, "battleship.db")};Default Timeout=15"));
builder.Services.AddIdentityCore<Account>(options =>
{
    options.Password.RequiredLength = 10;
    options.Password.RequireDigit = false;
    options.Password.RequireLowercase = false;
    options.Password.RequireUppercase = false;
    options.Password.RequireNonAlphanumeric = false;
    options.Lockout.MaxFailedAccessAttempts = 5;
    options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(5);
}).AddEntityFrameworkStores<AppDb>().AddSignInManager().AddDefaultTokenProviders();
builder.Services.AddAuthentication(IdentityConstants.ApplicationScheme).AddCookie(IdentityConstants.ApplicationScheme, options =>
{
    options.Cookie.Name = "battleship-account";
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Strict;
    options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
    options.ExpireTimeSpan = TimeSpan.FromDays(14);
    options.SlidingExpiration = false;
    options.Events = new CookieAuthenticationEvents
    {
        OnValidatePrincipal = async context =>
        {
            var db = context.HttpContext.RequestServices.GetRequiredService<AppDb>();
            if (await AccountApi.CurrentUser(context.HttpContext, db, context.Principal) is null) context.RejectPrincipal();
        },
        OnRedirectToLogin = context => { context.Response.StatusCode = 401; return Task.CompletedTask; },
        OnRedirectToAccessDenied = context => { context.Response.StatusCode = 403; return Task.CompletedTask; },
    };
});
builder.Services.AddAuthorization();
builder.Services.AddAntiforgery(options =>
{
    options.HeaderName = "X-CSRF-TOKEN";
    options.Cookie.Name = "battleship-csrf";
    options.Cookie.SameSite = SameSiteMode.Strict;
    options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
});
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = 429;
    options.AddPolicy("account-writes", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
    options.AddPolicy("social-writes", context => RateLimitPartition.GetFixedWindowLimiter(
        context.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 60, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
});
builder.Services.ConfigureHttpJsonOptions(options => options.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));

builder.Services.AddSingleton<IRoomStore, InMemoryRoomStore>();
builder.Services.AddSingleton<TimeProvider>(TimeProvider.System);
builder.Services.AddSingleton<PlayerPlatform>();
builder.Services.AddHostedService<PlatformWorker>();
builder.Services.AddSingleton<RoomCreationLimiter>();
builder.Services.Configure<ForwardedHeadersOptions>(options => ForwardedProxyConfiguration.Configure(options, builder.Configuration));
builder.Services.AddSingleton<RoomCreationRateLimitFilter>();
builder.Services.AddHostedService<RoomCleanupService>();
builder.Services.AddCors(options => options.AddPolicy("DevelopmentClient", policy =>
    policy.WithOrigins("http://localhost:5173", "http://localhost:5174").AllowAnyHeader().AllowAnyMethod().AllowCredentials()));
builder.Services.AddSignalR(options =>
{
    options.KeepAliveInterval = TimeSpan.FromSeconds(15);
    options.ClientTimeoutInterval = TimeSpan.FromSeconds(45);
    options.AddFilter<RoomCreationRateLimitFilter>();
}).AddJsonProtocol(options =>
{
    options.PayloadSerializerOptions.Converters.Add(new JsonStringEnumConverter());
    options.PayloadSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
});

var app = builder.Build();
app.UseForwardedHeaders();
app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();
app.Use(async (context, next) =>
{
    if (context.User.Identity?.IsAuthenticated == true && context.Request.Path.StartsWithSegments("/hub") &&
        context.Request.Headers.Origin.FirstOrDefault() is { } origin)
    {
        if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri)) { context.Response.StatusCode = 403; return; }
        var allowedDevelopment = app.Environment.IsDevelopment() && uri.Port is 5173 or 5174 &&
            (uri.Host == "localhost" || System.Net.IPAddress.TryParse(uri.Host, out var ip) && System.Net.IPAddress.IsLoopback(ip));
        if (!allowedDevelopment && uri.Authority != context.Request.Host.Value) { context.Response.StatusCode = 403; return; }
    }
    await next(context);
});

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDb>();
    await db.Database.MigrateAsync();
    await db.Matches.Where(match => match.State == MatchState.Playing || match.State == MatchState.Waiting)
        .ExecuteUpdateAsync(setters => setters.SetProperty(match => match.State, MatchState.Interrupted).SetProperty(match => match.Reason, "ServerRestart"));
    await db.Invites.Where(invite => invite.State == InviteState.Pending || invite.State == InviteState.Accepted)
        .ExecuteUpdateAsync(setters => setters.SetProperty(invite => invite.State, InviteState.Expired));
}

var webRoot = app.Environment.WebRootPath;
var hasClientBuild = webRoot is not null && File.Exists(Path.Combine(webRoot, "index.html"));
if (app.Environment.IsDevelopment()) app.UseCors("DevelopmentClient");
if (hasClientBuild)
{
    app.UseDefaultFiles();
    app.UseStaticFiles();
}
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));
app.MapHub<GameHub>("/hub/game");
app.MapAccounts();
app.MapCommunity();
if (hasClientBuild) app.MapFallbackToFile("index.html");

app.Run();

public partial class Program;
