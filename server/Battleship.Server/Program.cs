using System.Text.Json.Serialization;
using Battleship.Server;
using Microsoft.AspNetCore.SignalR;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton<IRoomStore, InMemoryRoomStore>();
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
if (hasClientBuild) app.MapFallbackToFile("index.html");

app.Run();

public partial class Program;
