using System.Security.Claims;
using System.Security.Cryptography;
using Battleship.Server.Data;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;

namespace Battleship.Server;

public sealed record RegisterAccount(string UserName, string DisplayName, string Password);
public sealed record LoginAccount(string UserName, string Password);
public sealed record ChangePasswordRequest(string CurrentPassword, string NewPassword);
public sealed record UpdateProfileRequest(string DisplayName);
public sealed record AccountView(string Id, string DisplayName, string PlayerCode, int Rating, int RankedGames, int RankedWins, int RankedLosses, string Rank);

public static class AccountApi
{
    public const string SessionClaim = "battleship-session";
    public static AccountView View(Account user) => new(user.Id, user.DisplayName, user.PlayerCode, user.Rating,
        user.RankedGames, user.RankedWins, user.RankedLosses, user.RankedGames < 10 ? "Đang xác định" :
        user.Rating < 1000 ? "Đồng" : user.Rating < 1200 ? "Bạc" : user.Rating < 1400 ? "Vàng" : user.Rating < 1600 ? "Bạch kim" : "Kim cương");

    public static async Task<Account?> CurrentUser(HttpContext context, AppDb db, ClaimsPrincipal? principal = null)
    {
        principal ??= context.User;
        var id = principal.FindFirstValue(ClaimTypes.NameIdentifier);
        var sessionId = principal.FindFirstValue(SessionClaim);
        if (id is null || sessionId is null) return null;
        var user = await db.Users.FindAsync(id);
        var session = await db.Sessions.FindAsync(sessionId);
        return user is not null && session?.AccountId == id && session.SecurityStamp == user.SecurityStamp &&
            session.ExpiresUtc > DateTime.UtcNow ? user : null;
    }

    public static void MapAccounts(this WebApplication app)
    {
        app.MapGet("/api/session", async (HttpContext context, AppDb db, IAntiforgery antiforgery) =>
        {
            var user = await CurrentUser(context, db);
            context.Response.Headers.CacheControl = "no-store";
            return Results.Ok(new { enabled = true, csrfToken = antiforgery.GetAndStoreTokens(context).RequestToken, user = user is null ? null : View(user) });
        });
        var api = SecureGroup(app);
        api.MapPost("/account/register", async (RegisterAccount request, HttpContext context, UserManager<Account> users, SignInManager<Account> signIn, AppDb db) =>
        {
            var name = request.UserName?.Trim() ?? "";
            var display = request.DisplayName?.Trim() ?? "";
            if (name.Length is < 3 or > 24 || name.Any(ch => !char.IsAsciiLetterOrDigit(ch) && ch != '_') ||
                display.Length is < 1 or > 32 || display.Any(char.IsControl) || request.Password is null || request.Password.Length > 128)
                return Error("INVALID_ACCOUNT", "Tên đăng nhập 3–24 chữ/số/gạch dưới; tên hiển thị 1–32 ký tự; mật khẩu tối thiểu 10 ký tự.");
            var user = new Account { UserName = name, DisplayName = display, PlayerCode = Convert.ToHexString(RandomNumberGenerator.GetBytes(6)) };
            var created = await users.CreateAsync(user, request.Password);
            if (!created.Succeeded) return Error("REGISTER_FAILED", "Không tạo được tài khoản. Hãy chọn tên khác và mật khẩu ít nhất 10 ký tự.");
            await SignIn(context, user, signIn, db);
            return Results.Ok(View(user));
        }).RequireRateLimiting("account-writes");
        api.MapPost("/account/login", async (LoginAccount request, HttpContext context, UserManager<Account> users, SignInManager<Account> signIn, AppDb db) =>
        {
            if (request.UserName is null || request.Password is null || request.UserName.Length > 24 || request.Password.Length > 128)
                return Error("LOGIN_FAILED", "Không thể đăng nhập bằng thông tin này.", 401);
            var user = await users.FindByNameAsync(request.UserName.Trim());
            if (user is null || !(await signIn.CheckPasswordSignInAsync(user, request.Password, lockoutOnFailure: true)).Succeeded)
                return Error("LOGIN_FAILED", "Không thể đăng nhập bằng thông tin này.", 401);
            await SignIn(context, user, signIn, db);
            return Results.Ok(View(user));
        }).RequireRateLimiting("account-writes");
        api.MapPost("/account/logout", async (HttpContext context, AppDb db) =>
        {
            var id = context.User.FindFirstValue(SessionClaim);
            if (id is not null && await db.Sessions.FindAsync(id) is { } session) { db.Sessions.Remove(session); await db.SaveChangesAsync(); }
            await context.SignOutAsync(IdentityConstants.ApplicationScheme);
            return Results.Ok();
        });
        api.MapPost("/account/password", async (ChangePasswordRequest request, HttpContext context, UserManager<Account> users, SignInManager<Account> signIn, AppDb db) =>
        {
            var user = await CurrentUser(context, db);
            if (user is null) return Results.Unauthorized();
            if (request.CurrentPassword is null || request.NewPassword is null || request.NewPassword.Length > 128 ||
                !(await users.ChangePasswordAsync(user, request.CurrentPassword, request.NewPassword)).Succeeded)
                return Error("PASSWORD_FAILED", "Không đổi được mật khẩu. Kiểm tra mật khẩu hiện tại và dùng mật khẩu mới ít nhất 10 ký tự.");
            db.Sessions.RemoveRange(db.Sessions.Where(session => session.AccountId == user.Id));
            await db.SaveChangesAsync();
            await SignIn(context, user, signIn, db);
            return Results.Ok();
        }).RequireRateLimiting("account-writes");
        api.MapPost("/account/profile", async (UpdateProfileRequest request, HttpContext context, AppDb db) =>
        {
            var user = await CurrentUser(context, db);
            if (user is null) return Results.Unauthorized();
            var name = request.DisplayName?.Trim() ?? "";
            if (name.Length is < 1 or > 32 || name.Any(char.IsControl)) return Error("INVALID_NAME", "Tên hiển thị cần 1–32 ký tự.");
            user.DisplayName = name;
            await db.SaveChangesAsync();
            return Results.Ok(View(user));
        }).RequireRateLimiting("account-writes");
        api.MapGet("/profile", async (HttpContext context, AppDb db, int page = 0) =>
        {
            var user = await CurrentUser(context, db);
            if (user is null) return Results.Unauthorized();
            page = Math.Clamp(page, 0, 10000);
            var matches = db.Matches.AsNoTracking().Where(match => match.OneId == user.Id || match.TwoId == user.Id);
            var history = await matches.OrderByDescending(match => match.CreatedUtc).Skip(page * 20).Take(20).ToArrayAsync();
            var matchIds = history.Select(match => match.Id).ToArray();
            var ratingChanges = await db.RatingChanges.AsNoTracking().Where(change => change.AccountId == user.Id && matchIds.Contains(change.MatchId))
                .Select(change => new { change.MatchId, change.Before, change.After }).ToArrayAsync();
            var completed = await matches.Where(match => match.State == MatchState.Finished)
                .Select(match => new { match.Mode, match.BotDifficulty, Won = match.OneId == user.Id ? match.Winner == Core.PlayerId.One : match.Winner == Core.PlayerId.Two }).ToArrayAsync();
            var stats = completed.GroupBy(match => new { match.Mode, match.BotDifficulty }).Select(group => new
            { group.Key.Mode, group.Key.BotDifficulty, played = group.Count(), wins = group.Count(match => match.Won), losses = group.Count(match => !match.Won) });
            return Results.Ok(new { user = View(user), history, ratingChanges, stats, page, hasMore = await matches.CountAsync() > (page + 1) * 20 });
        });
    }

    private static async Task SignIn(HttpContext context, Account user, SignInManager<Account> signIn, AppDb db)
    {
        var previous = context.User.FindFirstValue(SessionClaim);
        if (previous is not null && await db.Sessions.FindAsync(previous) is { } oldSession) db.Sessions.Remove(oldSession);
        db.Sessions.RemoveRange(db.Sessions.Where(session => session.ExpiresUtc <= DateTime.UtcNow));
        var session = new AccountSession { Id = WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(32)), AccountId = user.Id,
            SecurityStamp = user.SecurityStamp!, ExpiresUtc = DateTime.UtcNow.AddDays(context.Request.IsHttps ? 14 : 1) };
        db.Sessions.Add(session);
        await db.SaveChangesAsync();
        var principal = await signIn.CreateUserPrincipalAsync(user);
        ((ClaimsIdentity)principal.Identity!).AddClaim(new Claim(SessionClaim, session.Id));
        await context.SignInAsync(IdentityConstants.ApplicationScheme, principal, new AuthenticationProperties { IsPersistent = true, ExpiresUtc = session.ExpiresUtc });
    }

    public static IResult Error(string code, string message, int status = 400) => Results.Json(new { code, message }, statusCode: status);

    public static RouteGroupBuilder SecureGroup(WebApplication app)
    {
        var api = app.MapGroup("/api");
        api.AddEndpointFilter(async (invocation, next) =>
        {
            var context = invocation.HttpContext;
            context.Response.Headers.CacheControl = "no-store";
            if (!HttpMethods.IsGet(context.Request.Method))
            {
                try { await context.RequestServices.GetRequiredService<IAntiforgery>().ValidateRequestAsync(context); }
                catch (AntiforgeryValidationException) { return Error("INVALID_CSRF", "Phiên biểu mẫu đã đổi. Hãy tải lại và thử lại.", 400); }
            }
            return await next(invocation);
        });
        return api;
    }
}
