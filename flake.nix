{
  description = "Node 24 + pnpm 11 dev shell";

  inputs = {
    # nixos-unstable, not master: same channel the scanner repo tracks, so
    # both dev shells resolve the same nodejs_24. master moves per-commit and
    # drifts repos apart.
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
        nodejs = pkgs.nodejs_24;
        # Pin the exact pnpm from package.json's `packageManager` — nixpkgs'
        # pnpm_11 trails npm by weeks, and a devShell pnpm that differs from
        # the one CI/Docker use is how lockfile churn starts.
        # Bump both together; `hash` is the npm tarball's SRI digest:
        #   nix store prefetch-file --json https://registry.npmjs.org/pnpm/-/pnpm-<version>.tgz
        pnpm = pkgs.pnpm_11.override {
          nodejs-slim = nodejs;
          version = "11.20.0";
          hash = "sha256-NOGYyx5DI3UX7O39MfmuJqbAo+U2bOWKLQX0sh+18Zo=";
        };
        python = pkgs.python3.withPackages (ps: [ ps.pymupdf ]);
        java = pkgs.jdk21_headless;
        tools = with pkgs; [ git java nixfmt nodejs pnpm typescript python ];
      in {
        devShells.default = pkgs.mkShell {
          packages = tools;
        };
      });
}
