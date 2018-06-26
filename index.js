#!/usr/bin/env node

var program = require("commander"),
    coverCmd = require("./src/commands/cover"),
    profileCmd = require("./src/commands/profile"),
    creportCmd = require("./src/commands/coverage_report"),
    replaceCmd = require("./src/commands/replace"),
    sqlCmd = require("./src/commands/sql"),
    unusedCmd = require("./src/commands/unused"),
    searchCmd = require("./src/commands/search"),
    testCmd = require("./src/commands/test"),
    buildSchema = require("./src/schema");

// var str = '{"!!1":13,"!2":1,"!;":1,"!c":2,"!d":2,"!~1":1,"#1":2,"#:":1,"#;":1,"#Y":1,"$:":1,"$c":2,"$Y":1,"$Z1":2,"%:":1,"%?":2,"%U":1,"&!1":12,"&:":1,"&c":2,"&l":1,"&U":1,"&Y":1,"-!1":12,"-l":1,"-U":1,"-Y":1,"0:":1,"0?":1,"0d":2,"0m":1,"0S":1,"0Z":1,"1:":1,"1?":1,"2:":1,"2d":2,"2V":1,"2Z":1,"33":32,"3:":1,"3?":1,"3d":2,"3I":1,"3k2":2,"3o":4,"3S":1,"4:1":25,"4?":1,"4b":32,"4d":2,"4k2":2,"4l":1,"4o":4,"4Z":1,"5:1":13,"5?":1,"5k2":1,"5l":1,"5S":1,"6:1":12,"6d":2,"6k2":2,"6l":1,"6Z":1,"7;":1,"7?":1,"7e":2,"7I":1,"7o":1,"842":2,"8;":1,"8@1":2,"8l":1,"8Z":1,"9#1":1,"9;":1,"9?":1,"9I":1,"9l":1,"9S":1,"9Z":1,":1":12,":;":1,":@1":1,":d":32,":e":2,":t":4,":W":1,":Z1":89,":~1":1,";1":17,";:":1,";@1":1,";t":4,";Z1":27,":1":2,":;":1,":c":2,":R":1,":Z1":62,"?2":32,"?:":1,"?:1":5,"?c":2,"?d":2,"?W":1,"?Z1":27,"?~1":1,"@!1":13,"@:":1,"a#1":1,"a42":2,"a;":1,"A:1":4,"A?":1,"Ae":4,"al":1,"b#1":1,"b42":2,"B;1":1,"Be":4,"bI":1,"BR":1,"bV":1,"c#1":1,"C3":5,"c42":2,"C;1":1,"C4,"3S":1,"4:1":25,"4?":1,"4b":32,"4d":2,"4k2":2,"4l":1,"4o":4,"4Z":1,"5:1":13,"5?":1,"5k2":1,"5l":1,"5S":1,"6:1":12,"6d":2,"6k2":2,"6l":1,"6Z":1,"7;":1,"7?":1,"7e":2,"7I":1,"842":2,"8;":1,"8@1":2,"8l":1,"8Z":1,"9#1":1,"9;":1,"9?":1,"9I":1,"9l":1,"9S":1,"9Z":1,":1":12,":;":1,":@1":1,":d":32,":e":2,":t":4,":W":1,":Z1":89,":~1":1,";1":17,";:":1,";@1":1,";t":4,";Z1":27,":1":2,":;":1,":c":2,":R":1,":Z1":62,"?2":32,"?:":1,"?:1":5,"?c":2,"?d":2,"?W":1,"?Z1":27,"?~1":1,"@!1":13,"@:":1,"a#1":1,"a42":2,"a;":1,"A:1":4,"A?":1,"Ae":4,"al":1,"b#1":1,"b42":2,"B;1":1,"Be":4,"bI":1,"BR":1,"bV":1,"c#1":1,"C3":5,"c42":2,"C;1":1,"Ce":4,"cf":20,"cI":1,"cS":1,"cZ":1,"D;1":2,"De":4,"df":2,"dZ":1,"e;":1,"E;1":2,"e?":1,"E@1":1,"ef":18,"ER":1,"eS":1,"eV":1,"F1":1,"f;1":1,"f?":1,"fI":1,"FZ":1,"G1":1,"g;1":7,"g?":1,"G@1":1,"Ge":2,"gI":1,"GR":1,"GZ":1,"H1":1,"h;1":7,"h:":1,"He":2,"Hp":2,"HR":1,"Hy2":1,"i;1":14,"i:":1,"Ie":2,"IU":28,"Je":2,"k;1":14,"k:":1,"Ke":2,"kI":1,"KW":1,"KZ":32,"l;1":9,"L:1":4,"l?":1,"lf":20,"ll":1,"LT":1,"LZ1":1,"M3":6,"m;1":6,"M:1":4,"m?":1,"mf":4,"MW":1,"MZ1":1,"N1":41,"n2":41,"N3":18,"n;":1,"n?":146,"nb":1,"nl":2,"O1":14,"O3":6,"o:1":1,"Oe":2,"of":20,"OZ1":1,"P1":27,"P3":12,"p:1":1,"p:1":164,"pf":4,"pl":2,"Pt":4,"PZ1":1,"q;":1,"Q:1":8,"Qt":4,"qZ":1,"R!1":13,"r:":1,"Re":2,"rl":2,"Rt":4,"rZ":1,"RZ1":1,"S!1":44,"S1":41,"sf":4,"sI":1,"Sk":1,"St":12,"Sy2":2,"T!1":4,"Te":2,"tI":1,"Tk":1,"tl":2,"tQ":1,"Ty2":2,"U!1":9,"u2":23,"ub":2,"ul":2,"UR":1,"US":4,"UT":1,"Uy2":1,"V3":1,"vb":2,"ve":2,"vQ":1,"VS":4,"vY":1,"Vy2":1,"VZ1":2,"we":4,"Wt":4,"wY":1,"X1":41,"x:1":8,"xb":2,"Xe":4,"XR":1,"XS":4,"xY":2,"Y1":5,"Y2":32,"y:1":4,"Yd":32,"Ye":18,"YS":4,"YW":1,"yY":2,"Z1":1,"Z3":6,"z?":1,"Ze":2,"ZR":1,"Zt":4,"ZW":1,"_:":1,"_c":2,"_U":1,"~!1":13,"~1":2,"~;":1,"~:":1,"~:1":1,"~c":2,"~j2":2,"~k":1,"~Y":1}';

// console.log( JSON.parse( str ) );

// buildSchema("./src/assets/coldump.1.json", "./src/assets/coldump.json");

/*
var fixQ = require("./src/query");

[
    `
select 
    max( X.dt ) LastUpdate 
from 
    ( 
        select
            max(StartDate) Dt 
        from 
            Repl_Batch_Item 
        where BatchID=:A1 
        union all 
        select  
            max(CompleteDate) DT 
        from 
            Repl_Batch_Item 
        where
            BatchID=:A2 
    ) x`
].forEach(e => console.log(fixQ(e, true)));

return;
// */

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
    .command("test <file>")
    .description("Test search")
    .action(testCmd);

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
