using System.Collections.Concurrent;
using Microsoft.AspNetCore.SignalR;

namespace Battleship.Server;

public sealed class RoomCreationRateLimitFilter : IHubFilter
{
    private static readonly TimeSpan Window = TimeSpan.FromMinutes(1);
    private const int Limit = 5;
    private readonly ConcurrentDictionary<string, ClientBucket> _clients = new();

    public async ValueTask<object?> InvokeMethodAsync(
        HubInvocationContext invocationContext,
        Func<HubInvocationContext, ValueTask<object?>> next)
    {
        if (string.Equals(invocationContext.HubMethodName, "CreateRoom", StringComparison.Ordinal))
        {
            var clientId = invocationContext.Context.GetHttpContext()?.Connection.RemoteIpAddress?.ToString() ?? "unknown";
            if (!_clients.GetOrAdd(clientId, _ => new ClientBucket()).TryAcquire(DateTime.UtcNow))
                throw new HubException("ROOM_CREATE_RATE_LIMITED");
        }

        return await next(invocationContext);
    }

    private sealed class ClientBucket
    {
        private readonly Queue<DateTime> _requests = new();

        public bool TryAcquire(DateTime now)
        {
            lock (_requests)
            {
                while (_requests.TryPeek(out var timestamp) && now - timestamp >= Window)
                    _requests.Dequeue();

                if (_requests.Count >= Limit) return false;
                _requests.Enqueue(now);
                return true;
            }
        }
    }
}
