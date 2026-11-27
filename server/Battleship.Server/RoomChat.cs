using Battleship.Core;
using Microsoft.AspNetCore.SignalR;

namespace Battleship.Server;

public sealed record ChatMessage(long Id, string? ClientMessageId, PlayerId? Sender, string Content,
    DateTimeOffset SentAt, int Round, bool IsSystem = false);

/// <summary>Bounded room history. Call under Room.SyncRoot.</summary>
public sealed class RoomChat(TimeProvider? clock = null)
{
    public const int MaxLength = 300;
    public const int HistoryLimit = 100;
    private readonly TimeProvider _clock = clock ?? TimeProvider.System;
    private readonly List<ChatMessage> _messages = [];
    private readonly Dictionary<PlayerId, Queue<DateTimeOffset>> _sent = [];
    private long _sequence;

    public IReadOnlyList<ChatMessage> History => _messages.ToArray();

    public ChatMessage Send(PlayerId sender, string? requestId, string? content, int round)
    {
        if (string.IsNullOrEmpty(requestId) || requestId.Length > 64 ||
            requestId.Any(ch => !char.IsAsciiLetterOrDigit(ch) && ch is not '-' and not '_'))
            throw new HubException("CHAT_INVALID_REQUEST");
        var text = content?.Replace("\r\n", "\n").Replace('\r', '\n').Trim() ?? "";
        if (text.Length == 0) throw new HubException("CHAT_EMPTY");
        if (text.EnumerateRunes().Count() > MaxLength || text.Any(ch => char.IsControl(ch) && ch is not '\n' and not '\t'))
            throw new HubException("CHAT_TOO_LONG");

        var previous = _messages.FirstOrDefault(message => message.Sender == sender && message.ClientMessageId == requestId);
        if (previous is not null)
        {
            if (previous.Content != text) throw new HubException("CHAT_REQUEST_CONFLICT");
            return previous;
        }

        var now = _clock.GetUtcNow();
        if (!_sent.TryGetValue(sender, out var recent)) _sent[sender] = recent = new();
        while (recent.TryPeek(out var time) && time <= now - TimeSpan.FromSeconds(5)) recent.Dequeue();
        if (recent.Count >= 5) throw new HubException("CHAT_RATE_LIMITED");
        recent.Enqueue(now);
        return Append(new(++_sequence, requestId, sender, text, now, round));
    }

    public void StartRound(int round) =>
        Append(new(++_sequence, null, null, $"Bắt đầu ván {round}", _clock.GetUtcNow(), round, true));

    private ChatMessage Append(ChatMessage message)
    {
        _messages.Add(message);
        if (_messages.Count > HistoryLimit) _messages.RemoveAt(0);
        return message;
    }
}
