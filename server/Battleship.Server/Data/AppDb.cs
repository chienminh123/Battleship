using Battleship.Core;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace Battleship.Server.Data;

public sealed class Account : IdentityUser
{
    public string DisplayName { get; set; } = "";
    public string PlayerCode { get; set; } = "";
    public int Rating { get; set; } = 1000;
    public int RankedGames { get; set; }
    public int RankedWins { get; set; }
    public int RankedLosses { get; set; }
}

public sealed class AccountSession
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string AccountId { get; set; } = "";
    public string SecurityStamp { get; set; } = "";
    public DateTime ExpiresUtc { get; set; }
}

public enum MatchMode { Bot, Friendly, Ranked }
public enum MatchState { Waiting, Playing, Finished, Cancelled, Interrupted }
public sealed class MatchRecord
{
    public string Id { get; set; } = "";
    public string RoomCode { get; set; } = "";
    public MatchMode Mode { get; set; }
    public MatchState State { get; set; }
    public string? OneId { get; set; }
    public string? TwoId { get; set; }
    public BotDifficulty? BotDifficulty { get; set; }
    public PlayerId? Winner { get; set; }
    public string? Reason { get; set; }
    public DateTime CreatedUtc { get; set; }
    public DateTime? StartedUtc { get; set; }
    public DateTime? FinishedUtc { get; set; }
}

public sealed class RatingChange
{
    public string MatchId { get; set; } = "";
    public string AccountId { get; set; } = "";
    public int Before { get; set; }
    public int After { get; set; }
}

public sealed class FriendRelation
{
    public string FirstId { get; set; } = "";
    public string SecondId { get; set; } = "";
    public string RequestedBy { get; set; } = "";
    public bool Accepted { get; set; }
}

public sealed class PlayerBlock
{
    public string AccountId { get; set; } = "";
    public string BlockedId { get; set; } = "";
}

public enum InviteState { Pending, Accepted, Declined, Expired }
public sealed class GameInvite
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string SenderId { get; set; } = "";
    public string RecipientId { get; set; } = "";
    public InviteState State { get; set; }
    public DateTime ExpiresUtc { get; set; }
    public string? RoomCode { get; set; }
}

public sealed class AppDb(DbContextOptions<AppDb> options) : IdentityDbContext<Account>(options)
{
    public DbSet<AccountSession> Sessions => Set<AccountSession>();
    public DbSet<MatchRecord> Matches => Set<MatchRecord>();
    public DbSet<RatingChange> RatingChanges => Set<RatingChange>();
    public DbSet<FriendRelation> Friends => Set<FriendRelation>();
    public DbSet<PlayerBlock> Blocks => Set<PlayerBlock>();
    public DbSet<GameInvite> Invites => Set<GameInvite>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
        builder.Entity<Account>().Property(user => user.DisplayName).HasMaxLength(32);
        builder.Entity<Account>().Property(user => user.PlayerCode).HasMaxLength(12);
        builder.Entity<Account>().HasIndex(user => user.PlayerCode).IsUnique();
        builder.Entity<AccountSession>().HasOne<Account>().WithMany().HasForeignKey(session => session.AccountId).OnDelete(DeleteBehavior.Cascade);
        builder.Entity<AccountSession>().HasIndex(session => session.ExpiresUtc);
        builder.Entity<MatchRecord>().HasIndex(match => new { match.OneId, match.FinishedUtc });
        builder.Entity<MatchRecord>().HasIndex(match => new { match.TwoId, match.FinishedUtc });
        builder.Entity<MatchRecord>().HasIndex(match => new { match.State, match.Mode });
        builder.Entity<RatingChange>().HasKey(change => new { change.MatchId, change.AccountId });
        builder.Entity<RatingChange>().HasOne<MatchRecord>().WithMany().HasForeignKey(change => change.MatchId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<RatingChange>().HasOne<Account>().WithMany().HasForeignKey(change => change.AccountId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<FriendRelation>().HasKey(friend => new { friend.FirstId, friend.SecondId });
        builder.Entity<FriendRelation>().HasOne<Account>().WithMany().HasForeignKey(friend => friend.FirstId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<FriendRelation>().HasOne<Account>().WithMany().HasForeignKey(friend => friend.SecondId).OnDelete(DeleteBehavior.Restrict);
        builder.Entity<PlayerBlock>().HasKey(block => new { block.AccountId, block.BlockedId });
        builder.Entity<GameInvite>().HasIndex(invite => new { invite.RecipientId, invite.State });
        var utc = new ValueConverter<DateTime, DateTime>(value => value, value => DateTime.SpecifyKind(value, DateTimeKind.Utc));
        var nullableUtc = new ValueConverter<DateTime?, DateTime?>(value => value,
            value => value.HasValue ? DateTime.SpecifyKind(value.Value, DateTimeKind.Utc) : null);
        foreach (var property in builder.Model.GetEntityTypes().SelectMany(entity => entity.GetProperties()))
        {
            if (property.ClrType == typeof(DateTime)) property.SetValueConverter(utc);
            else if (property.ClrType == typeof(DateTime?)) property.SetValueConverter(nullableUtc);
        }
    }
}

public sealed class AppDbFactory : IDesignTimeDbContextFactory<AppDb>
{
    public AppDb CreateDbContext(string[] args) => new(new DbContextOptionsBuilder<AppDb>()
        .UseSqlite("Data Source=artifacts/design.db").Options);
}
