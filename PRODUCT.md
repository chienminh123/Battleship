# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

ASP.NET Core .NET 8 with SignalR, React with TypeScript and Vite; delegated from the confirmed Battleship plan.

## Users

Two people who want to play Battleship online together without creating accounts. One person creates a room and shares its code; the other joins with that code.

Players can also practice alone against a server-controlled random opponent. The interface is in Vietnamese.

## Product Purpose

Let two players play the original Battleship game online. Success means they can place fleets, take alternating shots, and finish a complete match over a live connection.

## Positioning

Private, code-based matches with original Battleship rules enforced by the server.

## Operating Context

Players use separate browser sessions and may reconnect after a refresh or network interruption. The game is intended to work on desktop and mobile browsers.

## Capabilities and Constraints

- Anonymous two-player rooms identified by a shareable code.
- A 10×10 board and five original ships: Carrier (5), Battleship (4), Cruiser (3), Submarine (3), and Destroyer (2).
- Ships may touch but cannot overlap or extend beyond the board.
- Players alternate one shot per turn; a shot may be a miss, hit, or sink.
- The first player to sink all five opposing ships wins.
- The server owns game state and validates actions. An opponent's ship locations remain private until the match ends.
- Current room storage is in memory; no database or login is planned.
- A player token stored in local storage supports reconnecting to the same seat.
- A computer opponent places a legal random fleet and fires uniformly at untried cells, without inspecting the human fleet to choose targets.
- Battles emphasize the enemy board on the player's turn and the visible own fleet on the opponent's turn. Players can switch boards manually or disable automatic switching.
- Ships are drawn as continuous silhouettes across occupied cells. Misses, hits, and sunk ships use distinct colors and symbols with a visible legend.
- The 3D interface adds an optional Three.js ocean board with distinct ship models and shot, splash, explosion, and sinking animations. Players choose a target then confirm the shot; camera rotation is a separate mode.
- Mobile shows one board at a time with tabs; desktop also shows the secondary board. Quality, effects volume, sea ambience, mute, and 2D fallback are player controls.
- The 3D branch adds an optional Three.js ocean board with distinct ship models, shot/splash/explosion/sinking animation, and synthesized audio. Players select a cell then confirm their shot. Camera rotation is a separate mode.
- On mobile, one board is shown at a time with tabs. Desktop also shows the secondary board. Quality, sound effects, ambient volume, mute, and the 2D fallback are player controls.

## Evidence on Hand

The user supplied a Battleship implementation plan at `C:\Users\ASUS\Downloads\KE_HOACH_BATTLESHIP.md`. It is the confirmed source for the rules, stack, and deployment constraints.

## Product Principles

- Keep the original Battleship rules intact.
- Make room creation and joining quick without accounts.
- Keep game outcomes authoritative on the server.
- Preserve opponent fleet privacy until the game is over.
- Support reconnecting to an interrupted match.
