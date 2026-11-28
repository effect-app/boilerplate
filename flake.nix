{
  description = "Node 24 + pnpm 12 dev shell";

  inputs = {
    # nixos-unstable, not master: same channel the scanner repo tracks, so
    # both dev shells resolve the same nodejs_24. master moves per-commit and
    # drifts repos apart.
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs { inherit system; };
        # keep the existing Nixpkgs lock and use the official security release
        nodeVersion = "24.22.1";
        nodeAssets = {
          x86_64-linux = {
            file = "linux-x64.tar.xz";
            hash = "sha256-bBcqmrZxj3uAH7WnvUhq8u5eMnWAhqBLhPzOKqdwleY=";
          };
          aarch64-linux = {
            file = "linux-arm64.tar.xz";
            hash = "sha256-26v3ocv5R+YFn/rSwnuABB25feoeVTtir97n8T/KM24=";
          };
          x86_64-darwin = {
            file = "darwin-x64.tar.xz";
            hash = "sha256-ZeRQ+Qpuqs1QAPYRhhxM5l+tyH+BN5XcTtDA5fL8otQ=";
          };
          aarch64-darwin = {
            file = "darwin-arm64.tar.xz";
            hash = "sha256-ZUunneYVVkfiIyGTK0Xyocy3BZdswzfJuOJ4vrCFpig=";
          };
        };
        nodeAsset = nodeAssets.${system};
        nodejs = pkgs.stdenv.mkDerivation {
          pname = "nodejs";
          version = nodeVersion;
          src = pkgs.fetchurl {
            url = "https://nodejs.org/dist/v${nodeVersion}/node-v${nodeVersion}-${nodeAsset.file}";
            hash = nodeAsset.hash;
          };
          nativeBuildInputs = pkgs.lib.optionals pkgs.stdenv.isLinux [ pkgs.autoPatchelfHook ];
          buildInputs = pkgs.lib.optionals pkgs.stdenv.isLinux [ pkgs.stdenv.cc.cc.lib ];
          passthru.python = pkgs.python3;
          meta.platforms = builtins.attrNames nodeAssets;
          dontConfigure = true;
          dontBuild = true;
          dontStrip = true;
          installPhase = ''
            runHook preInstall
            mkdir -p "$out"
            cp -R . "$out"
            runHook postInstall
          '';
        };
        # pnpm 12 is a native release archive; retain its adjacent node-gyp files
        pnpmVersion = "12.23.0";
        pnpmAssets = {
          x86_64-linux = {
            file = "pnpm-linux-x64.tar.gz";
            hash = "sha256-tRXinyrBrcD75jFzQUpmgoJ7r/JPF+etNHaCG97yNqw=";
          };
          aarch64-linux = {
            file = "pnpm-linux-arm64.tar.gz";
            hash = "sha256-3QP3YWYl/48T2VL2QfCGSiMA1z0KdRpoJzdhW9n5p6I=";
          };
          x86_64-darwin = {
            file = "pnpm-darwin-x64.tar.gz";
            hash = "sha256-llWHfGPzO7tkUIhx5EP8BaXkqHZBwb7Ng6RXF6SxXZA=";
          };
          aarch64-darwin = {
            file = "pnpm-darwin-arm64.tar.gz";
            hash = "sha256-UrsxS/DUiSj8FRJszOQqoZknXikBi+8RKgSuis3KrxQ=";
          };
        };
        pnpmAsset = pnpmAssets.${system};
        pnpm = pkgs.stdenv.mkDerivation {
          pname = "pnpm";
          version = pnpmVersion;
          src = pkgs.fetchurl {
            url = "https://github.com/pnpm/pnpm/releases/download/v${pnpmVersion}/${pnpmAsset.file}";
            hash = pnpmAsset.hash;
          };
          nativeBuildInputs = pkgs.lib.optionals pkgs.stdenv.isLinux [ pkgs.autoPatchelfHook ];
          buildInputs = pkgs.lib.optionals pkgs.stdenv.isLinux [ pkgs.stdenv.cc.cc.lib ];
          # the archive has the pnpm binary next to dist/. Nix otherwise
          # treats the only directory, dist/, as the source root and the
          # binary is left behind. dist/ is the bundled node-gyp. pnpm looks
          # for it beside the executable, and beside a symlink's target.
          sourceRoot = ".";
          dontConfigure = true;
          dontBuild = true;
          installPhase = ''
            runHook preInstall
            mkdir -p "$out/lib/pnpm" "$out/bin"
            cp -r pnpm dist "$out/lib/pnpm/"
            ln -s "$out/lib/pnpm/dist" "$out/bin/dist"
            chmod 755 "$out/lib/pnpm/pnpm"
            ln "$out/lib/pnpm/pnpm" "$out/bin/pnpm"
            ln "$out/lib/pnpm/pnpm" "$out/bin/pn"
            ln "$out/lib/pnpm/pnpm" "$out/bin/pnx"
            ln "$out/lib/pnpm/pnpm" "$out/bin/pnpx"
            runHook postInstall
          '';
        };
        python = pkgs.python3.withPackages (ps: [ ps.pymupdf ]);
        java = pkgs.jdk21_headless;
        # keep generated compiler launchers on the patched runtime
        typescript = pkgs.typescript.override {
          buildNpmPackage = pkgs.buildNpmPackage.override { inherit nodejs; };
        };
        tools = with pkgs; [
          git
          java
          nixfmt
          nodejs
          pnpm
          typescript
          python
        ];
      in
      {
        devShells.default = pkgs.mkShell {
          packages = tools;
        };
      }
    );
}
