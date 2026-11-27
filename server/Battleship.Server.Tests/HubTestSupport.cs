using System.Security.Claims;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Connections.Features;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging.Abstractions;

namespace Battleship.Server.Tests;

internal sealed class TestCallerContext(string connectionId, HttpContext? httpContext = null, ClaimsPrincipal? user = null) : HubCallerContext
{
    private readonly IFeatureCollection _features = CreateFeatures(httpContext);
    public override string ConnectionId => connectionId;
    public override string? UserIdentifier => null;
    public override ClaimsPrincipal? User => user;
    public override IDictionary<object, object?> Items { get; } = new Dictionary<object, object?>();
    public override IFeatureCollection Features => _features;
    public override CancellationToken ConnectionAborted => CancellationToken.None;
    public override void Abort() { }

    private static IFeatureCollection CreateFeatures(HttpContext? httpContext)
    {
        var features = new FeatureCollection();
        if (httpContext is not null) features.Set<IHttpContextFeature>(new TestHttpContextFeature(httpContext));
        return features;
    }

    private sealed class TestHttpContextFeature(HttpContext context) : IHttpContextFeature
    {
        public HttpContext? HttpContext { get; set; } = context;
    }
}

internal sealed record SentMessage(string Connection, string Method, object?[] Arguments);

internal sealed class TestHubClients(string caller) : IHubCallerClients
{
    public List<SentMessage> Messages { get; } = [];
    public IClientProxy All => Client("all");
    public IClientProxy Caller => Client(caller);
    public IClientProxy Others => Client("others");
    public IClientProxy AllExcept(IReadOnlyList<string> ids) => Client("all-except");
    public IClientProxy Client(string connectionId) => new RecordingProxy(connectionId, Messages);
    public IClientProxy Clients(IReadOnlyList<string> ids) => Client(string.Join(',', ids));
    public IClientProxy Group(string name) => Client(name);
    public IClientProxy GroupExcept(string name, IReadOnlyList<string> ids) => Client(name);
    public IClientProxy Groups(IReadOnlyList<string> names) => Client(string.Join(',', names));
    public IClientProxy OthersInGroup(string name) => Client(name);
    public IClientProxy User(string id) => Client(id);
    public IClientProxy Users(IReadOnlyList<string> ids) => Client(string.Join(',', ids));

    private sealed class RecordingProxy(string connection, List<SentMessage> messages) : IClientProxy
    {
        public Task SendCoreAsync(string method, object?[] args, CancellationToken cancellationToken = default)
        {
            messages.Add(new SentMessage(connection, method, args));
            return Task.CompletedTask;
        }
    }
}

internal static class HubTestSupport
{
    public static GameHub Hub(IRoomStore store, string connection = "owner", PlayerPlatform? platform = null, ClaimsPrincipal? user = null) => new(store, NullLogger<GameHub>.Instance, platform)
    {
        Context = new TestCallerContext(connection, user: user),
        Clients = new TestHubClients(connection)
    };

    public static HubInvocationContext Invocation(HubCallerContext context, Hub hub, string method) => new(
        context, EmptyServiceProvider.Instance, hub, typeof(GameHub).GetMethod(method)!, []);

    private sealed class EmptyServiceProvider : IServiceProvider
    {
        public static readonly EmptyServiceProvider Instance = new();
        public object? GetService(Type serviceType) => null;
    }
}
