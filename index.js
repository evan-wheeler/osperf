#!/usr/bin/env node

var program = require('commander'),
    coverCmd = require( './src/commands/cover'),
    profileCmd = require( './src/commands/profile' );

var VERSION = "0.0.1";

program.version( VERSION )

program.command( "profile <modules...>")
    .description( "Instrument modules with profiling instructions.")
    .option( "-b, --base <path>", "Use base source control directory", "c:/opentext/sharedsc/" )
    .action( profileCmd )

program.command( "cover <modules...>")
    .description( "Instrument modules with coverage instructions.")
    .option( "-b, --base <path>", "Use base source control directory", "c:/opentext/sharedsc/" )
    .option( '-o, --output <file>', "Set coverage output file", "coverage.json" )
    .action( coverCmd );

program.parse( process.argv );
