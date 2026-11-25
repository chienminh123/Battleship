FROM node:24-alpine AS client-build
WORKDIR /src/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS server-build
WORKDIR /src
COPY NuGet.Config ./
COPY server/Battleship.Core/Battleship.Core.csproj server/Battleship.Core/
COPY server/Battleship.Server/Battleship.Server.csproj server/Battleship.Server/
RUN dotnet restore server/Battleship.Server/Battleship.Server.csproj
COPY server/ server/
RUN dotnet publish server/Battleship.Server/Battleship.Server.csproj -c Release --no-restore -o /app/publish /p:UseAppHost=false
COPY --from=client-build /src/client/dist /app/publish/wwwroot

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
COPY --from=server-build /app/publish ./
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD curl --fail --silent http://127.0.0.1:8080/health || exit 1
ENTRYPOINT ["dotnet", "Battleship.Server.dll"]
