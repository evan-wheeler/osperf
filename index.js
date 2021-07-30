#!/usr/bin/env node

var program = require("commander"),
  coverCmd = require("./src/commands/cover"),
  profileCmd = require("./src/commands/profile"),
  creportCmd = require("./src/commands/coverage_report"),
  replaceCmd = require("./src/commands/replace"),
  sqlCmd = require("./src/commands/sql"),
  unusedCmd = require("./src/commands/unused"),
  searchCmd = require("./src/commands/search"),
  fixcaseCmd = require("./src/commands/fixcase"),
  testCmd = require("./src/commands/test"),
  buildSchema = require("./src/commands/schema");

var VERSION = "0.0.1";

program.version(VERSION);

program
  .command("profile <modules...>")
  .description("Instrument modules with profiling instructions.")
  .option(
    "-b, --base <path>",
    "Use base source control directory",
    "c:/opentext/sharedsc/"
  )
  .action(profileCmd);

program
  .command("cover <modules...>")
  .description("Instrument modules with coverage instructions.")
  .option(
    "-b, --base <path>",
    "Use base source control directory",
    "c:/opentext/sharedsc/"
  )
  .option("-o, --output <file>", "Set coverage output file", "coverage.json")
  .option("-t, --timings", "Include function timing", true)
  .action(coverCmd);

program
  .command("creport <files...>")
  .description("Create coverage report")
  .option("-c, --coverage <path>", "Use coverage file", "coverage.json")
  .option("-o, --output <dir>", "Name of coverage report directory", "covero")
  .action(creportCmd);

program
  .command("search <modules...>")
  .description("Find pattern in modules")
  .option(
    "-b, --base <path>",
    "Use base source control directory",
    "c:/opentext/sharedsc/"
  )
  .action(searchCmd);

program
  .command("fixcase <modules...>")
  .description("Fix table name case in sql statements for modules")
  .option(
    "-b, --base <path>",
    "Use base source control directory",
    "c:/opentext/sharedsc/"
  )
  .action(fixcaseCmd);

program.command("test <file>").description("Test search").action(testCmd);

program
  .command("schema <files...>")
  .description("Build schema")
  .action(buildSchema);

program
  .command("unused <modules...>")
  .description("Find potentially unused scripts")
  .option(
    "-b, --base <path>",
    "Use base source control directory",
    "c:/opentext/sharedsc/"
  )
  .action(unusedCmd);

program
  .command("replace <token> <replacement> <modules...>")
  .description("Replace token in modules")
  .option(
    "-b, --base <path>",
    "Use base source control directory",
    "c:/opentext/sharedsc/"
  )
  .action(replaceCmd);

program
  .command("sql <modules...>")
  .description("Swap capi.exec with $Replicator.Q.ExecSQL.")
  .option(
    "-b, --base <path>",
    "Use base source control directory",
    "c:/opentext/sharedsc/"
  )
  .action(sqlCmd);

program.parse(process.argv);
