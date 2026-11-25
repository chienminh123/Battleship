using Battleship.Core;

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
    GameOverMessage? Result = null);

public sealed record FleetPlacementDto(ShipType Type, Coordinate Start, Orientation Orientation);

public sealed record SubmitFleetResponse(
    bool Accepted,
    GamePhase Phase,
    string? Error = null,
    IReadOnlyList<FleetValidationError>? Errors = null);

public sealed record FireResponse(
    bool Accepted,
    GameShotStatus Status,
    Coordinate Coordinate,
    ShipType? SunkShip = null,
    PlayerId? Winner = null);

public sealed record GameStartedMessage(bool IsYourTurn);

public sealed record ShotResultMessage(
    GameShotStatus Status,
    Coordinate Coordinate,
    ShipType? SunkShip = null,
    PlayerId? Winner = null);

public sealed record IncomingShotMessage(
    Coordinate Coordinate,
    GameShotStatus Status,
    ShipType? SunkShip = null);

public sealed record GameOverMessage(PlayerId Winner, IReadOnlyList<ShipView> OpponentFleet);

public sealed record OpponentJoinedMessage(PlayerId Player);
public sealed record OpponentReconnectedMessage(PlayerId Player);
public sealed record OpponentLeftMessage(PlayerId Player);
