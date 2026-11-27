using System.Globalization;
using System.Net;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.HttpOverrides;

namespace Battleship.Server;

public static class ForwardedProxyConfiguration
{
    public static void Configure(ForwardedHeadersOptions options, IConfiguration configuration)
    {
        options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
        options.ForwardLimit = 1;
        options.KnownNetworks.Clear();
        options.KnownProxies.Clear();
        options.KnownProxies.Add(IPAddress.Loopback);
        options.KnownProxies.Add(IPAddress.IPv6Loopback);
        foreach (var entry in configuration.GetSection("ForwardedHeaders:KnownProxies").GetChildren())
            if (!string.IsNullOrWhiteSpace(entry.Value)) options.KnownProxies.Add(IPAddress.Parse(entry.Value));
        foreach (var entry in configuration.GetSection("ForwardedHeaders:KnownNetworks").GetChildren())
        {
            if (string.IsNullOrWhiteSpace(entry.Value)) continue;
            var parts = entry.Value.Split('/');
            if (parts.Length != 2) throw new InvalidOperationException("KnownNetworks must contain CIDR ranges.");
            options.KnownNetworks.Add(new Microsoft.AspNetCore.HttpOverrides.IPNetwork(
                IPAddress.Parse(parts[0]), int.Parse(parts[1], CultureInfo.InvariantCulture)));
        }
    }
}
