using System.Collections.Concurrent;
using System.Security.Cryptography;

namespace Battleship.Server;

public interface IRoomStore
{
    Room Create();
    bool TryGet(string code, out Room room);
    bool TryRemove(string code, out Room? room);
    IEnumerable<Room> Rooms { get; }
}

public sealed class InMemoryRoomStore : IRoomStore
{
    private const string Alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private readonly ConcurrentDictionary<string, Room> _rooms = new(StringComparer.OrdinalIgnoreCase);

    public IEnumerable<Room> Rooms => _rooms.Values;

    public Room Create()
    {
        if (_rooms.Count >= 10_000) throw new InvalidOperationException("Room capacity reached.");
        for (var attempt = 0; attempt < 100; attempt++)
        {
            var code = CreateCode();
            var ownerToken = Guid.NewGuid().ToString("N");
            var room = new Room(code, ownerToken);
            if (_rooms.TryAdd(code, room)) return room;
        }

        throw new InvalidOperationException("Unable to allocate a unique room code.");
    }

    public bool TryGet(string code, out Room room) => _rooms.TryGetValue(code.Trim(), out room!);

    public bool TryRemove(string code, out Room? room) => _rooms.TryRemove(code, out room);

    private string CreateCode()
    {
        Span<char> chars = stackalloc char[6];
        for (var index = 0; index < chars.Length; index++) chars[index] = Alphabet[RandomNumberGenerator.GetInt32(Alphabet.Length)];
        return new string(chars);
    }
}
