using System.Net;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace Battleship.Server.Tests;

public sealed class ProxyAndRateLimitTests
{
    private sealed class Clock : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = new(2026, 11, 27, 0, 0, 0, TimeSpan.Zero);
        public override DateTimeOffset GetUtcNow() => Now;
    }

    private static async Task<string> ForwardedIp(string source, string forwarded, bool trustGateway = true)
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(trustGateway
            ? new Dictionary<string, string?> { ["ForwardedHeaders:KnownProxies:0"] = "172.30.52.1" }
            : new Dictionary<string, string?>()).Build();
        var options = new ForwardedHeadersOptions();
        ForwardedProxyConfiguration.Configure(options, configuration);
        var context = new DefaultHttpContext();
        context.Connection.RemoteIpAddress = IPAddress.Parse(source);
        context.Request.Headers["X-Forwarded-For"] = forwarded;
        context.Request.Headers["X-Forwarded-Proto"] = "https";
        var middleware = new ForwardedHeadersMiddleware(_ => Task.CompletedTask, NullLoggerFactory.Instance, Options.Create(options));
        await middleware.Invoke(context);
        if (source == "172.30.52.1" && trustGateway) Assert.Equal("https", context.Request.Scheme);
        return context.Connection.RemoteIpAddress!.ToString();
    }

    [Fact]
    public async Task Real_clients_behind_the_trusted_gateway_have_independent_quotas()
    {
        var limiter = new RoomCreationLimiter(new Clock());
        var first = await ForwardedIp("172.30.52.1", "203.0.113.10");
        var second = await ForwardedIp("172.30.52.1", "203.0.113.11");
        Assert.NotEqual(first, second);
        for (var i = 0; i < 5; i++) Assert.True(limiter.TryAcquire(first));
        Assert.False(limiter.TryAcquire(first));
        Assert.True(limiter.TryAcquire(second));
    }

    [Fact]
    public async Task Untrusted_clients_cannot_forge_their_source_address()
    {
        Assert.Equal("198.51.100.9", await ForwardedIp("198.51.100.9", "203.0.113.1"));
        Assert.Equal("172.30.52.1", await ForwardedIp("172.30.52.1", "203.0.113.1", false));
    }

    [Fact]
    public async Task Only_the_rightmost_address_added_by_the_proxy_is_used()
    {
        Assert.Equal("198.51.100.9", await ForwardedIp("172.30.52.1", "1.2.3.4, 198.51.100.9"));
    }

    [Fact]
    public void Quotas_expire_and_idle_ip_buckets_are_removed()
    {
        var clock = new Clock();
        var limiter = new RoomCreationLimiter(clock);
        for (var i = 0; i < 5; i++) Assert.True(limiter.TryAcquire("first"));
        Assert.False(limiter.TryAcquire("first"));
        Assert.True(limiter.TryAcquire("second"));
        Assert.Equal(2, limiter.TrackedClientCount);
        clock.Now += TimeSpan.FromMinutes(1);
        Assert.True(limiter.TryAcquire("third"));
        Assert.Equal(1, limiter.TrackedClientCount);
        Assert.True(limiter.TryAcquire("first"));
    }

    [Fact]
    public void Concurrent_requests_cannot_exceed_the_quota()
    {
        var limiter = new RoomCreationLimiter(new Clock());
        var accepted = 0;
        Parallel.For(0, 100, _ => { if (limiter.TryAcquire("same-ip")) Interlocked.Increment(ref accepted); });
        Assert.Equal(5, accepted);
    }
}
