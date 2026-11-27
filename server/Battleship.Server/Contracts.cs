using Battleship.Core;
using Battleship.Server.Data;

namespace Battleship.Server;

public sealed record CreateRoomResponse(string Code, string PlayerToken, PlayerId Player);

public sealed record JoinRoomResponse(
    string Code,
    string PlayerToken,
    PlayerId Player,
    GamePhase Phase,
    PlayerId? CurrentPlayer,
    bool IsYourTurn,
    bool OpponentConnected,
    bool OwnFleetSubmitted,
    bool OpponentFleetSubmitted,
    BoardView OwnBoard,
    IReadOnlyList<ShotHistoryItem> ShotsAgainstOpponent,
    IReadOnlyList<ShotHistoryItem> ShotsAgainstYou,
    GameOverMessage? Result = null,
    bool IsBot = false,
    BotDifficulty? BotDifficulty = null,
    IReadOnlyList<ChatMessage>? ChatMessages = null,
    string? MatchId = null,
    MatchMode Mode = MatchMode.Friendly,
    DateTime? TurnDeadlineUtc = null,
    DateTime? PlacementDeadlineUtc = null);

public sealed record FleetPlacementDto(ShipType Type, Coordinate Start, Orientation Orientation);

public sealed record SubmitFleetResponse(
    bool Accepted,
    GamePhase Phase,
    string? Error = null,
    IReadOnlyList<FleetValidationError>? Errors = null,
    BoardView? OwnBoard = null);

public sealed record FireResponse(
    bool Accepted,
    GameShotStatus Status,
    Coordinate Coordinate,
    ShipType? SunkShip = null,
    PlayerId? Winner = null,
    IReadOnlyList<Coordinate>? SunkCells = null);

public sealed record GameStartedMessage(bool IsYourTurn, DateTime? TurnDeadlineUtc = null);

public sealed record ShotResultMessage(
    GameShotStatus Status,
    Coordinate Coordinate,
    ShipType? SunkShip = null,
    PlayerId? Winner = null,
    IReadOnlyList<Coordinate>? SunkCells = null,
    DateTime? TurnDeadlineUtc = null);

public sealed record IncomingShotMessage(
    Coordinate Coordinate,
    GameShotStatus Status,
    ShipType? SunkShip = null,
    DateTime? TurnDeadlineUtc = null);

public sealed record GameOverMessage(PlayerId Winner, IReadOnlyList<ShipView> OpponentFleet, string? Reason = null);

public sealed record OpponentJoinedMessage(PlayerId Player);
public sealed record OpponentReconnectedMessage(PlayerId Player);
public sealed record OpponentLeftMessage(PlayerId Player);
