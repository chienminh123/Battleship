using Microsoft.AspNetCore.SignalR;

namespace Battleship.Server;

public sealed class RoomCreationRateLimitFilter(RoomCreationLimiter limiter) : IHubFilter
{

    public async ValueTask<object?> InvokeMethodAsync(
        HubInvocationContext invocationContext,
        Func<HubInvocationContext, ValueTask<object?>> next)
    {
        if (invocationContext.HubMethodName is "CreateRoom" or "CreateBotRoom" or "CreateBotRoomWithDifficulty")
        {
            var clientId = invocationContext.Context.GetHttpContext()?.Connection.RemoteIpAddress?.ToString() ?? "unknown";
            if (!limiter.TryAcquire(clientId))
                throw new HubException("ROOM_CREATE_RATE_LIMITED");
        }

        return await next(invocationContext);
    }

}
