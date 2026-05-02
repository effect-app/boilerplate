{
  description = "Node 24 + pnpm 10 dev shell";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/master";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
        nodejs = pkgs.nodejs_24;
        pnpm = pkgs.pnpm.override { inherit nodejs; };
        python = pkgs.python3.withPackages (ps: [ ps.pymupdf ]);
        java = pkgs.jdk21_headless;
        tools = with pkgs; [ git java nixfmt nodejs pnpm typescript python ];
      in {
        devShells.default = pkgs.mkShell {
          packages = tools;
        };
      });
}
