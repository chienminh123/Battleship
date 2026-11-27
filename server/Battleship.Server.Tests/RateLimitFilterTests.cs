using System.Net;
using Battleship.Server;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Http.Connections.Features;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging.Abstractions;

namespace Battleship.Server.Tests;

public sealed class RateLimitFilterTests
{
    private sealed class Context(IPAddress address) : HubCallerContext
    {
        private readonly IFeatureCollection _features = MakeFeatures(address);
        public override string ConnectionId => "client";
        public override string? UserIdentifier => null;
        public override System.Security.Claims.ClaimsPrincipal? User => null;
        public override IDictionary<object, object?> Items { get; } = new Dictionary<object, object?>();
        public override IFeatureCollection Features => _features;
        public override CancellationToken ConnectionAborted => CancellationToken.None;
        public override void Abort() { }

        private static IFeatureCollection MakeFeatures(IPAddress address)
        {
            var http = new DefaultHttpContext();
            http.Connection.RemoteIpAddress = address;
            var features = new FeatureCollection();
            features.Set<IHttpContextFeature>(new Feature(http));
            return features;
        }

        private sealed class Feature(HttpContext context) : IHttpContextFeature
        {
            public HttpContext? HttpContext { get; set; } = context;
        }
    }

    private sealed class EmptyProvider : IServiceProvider
    {
        public object? GetService(Type serviceType) => null;
    }

    [Theory]
    [InlineData(nameof(GameHub.CreateRoom))]
    [InlineData(nameof(GameHub.CreateBotRoom))]
    [InlineData(nameof(GameHub.CreateBotRoomWithDifficulty))]
    public async Task Exhausted_quota_rejects_create_before_invoking_the_method(string method)
    {
        var limiter = new RoomCreationLimiter(TimeProvider.System);
        for (var i = 0; i < 5; i++) Assert.True(limiter.TryAcquire("192.0.2.1"));
        var hub = new GameHub(new InMemoryRoomStore(), NullLogger<GameHub>.Instance);
        var invocation = new HubInvocationContext(new Context(IPAddress.Parse("192.0.2.1")), new EmptyProvider(), hub,
            typeof(GameHub).GetMethod(method)!, []);
        var called = false;
        var error = await Assert.ThrowsAsync<HubException>(async () => await new RoomCreationRateLimitFilter(limiter)
            .InvokeMethodAsync(invocation, _ => { called = true; return ValueTask.FromResult<object?>(null); }));
        Assert.Equal("ROOM_CREATE_RATE_LIMITED", error.Message);
        Assert.False(called);
    }

    [Fact]
    public async Task Non_creation_methods_are_not_limited()
    {
        var filter = new RoomCreationRateLimitFilter(new RoomCreationLimiter(TimeProvider.System));
        var invocation = new HubInvocationContext(new Context(IPAddress.Loopback), new EmptyProvider(),
            new GameHub(new InMemoryRoomStore(), NullLogger<GameHub>.Instance), typeof(GameHub).GetMethod(nameof(GameHub.JoinRoom))!, []);
        var called = false;
        await filter.InvokeMethodAsync(invocation, _ => { called = true; return ValueTask.FromResult<object?>(null); });
        Assert.True(called);
    }
}
