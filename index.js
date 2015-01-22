var fs = require( 'fs' ),
    Parser = require( './src/parser' ),
    instrument = require( './src/instrument' ),
    glob = require("glob"),
    program = require('commander'),
    async = require( 'async' ),
    _ = require( 'lodash' );
    
function collect(val, list) {
  list.push(val);
  return list;
}

program.version('0.0.1')
    .option( '-b, --base <dir>', 'Base path to search', process.cwd() )
    .option( '-s, --search <pattern>', 'Instrument files that match the specified glob [**/*.Script]', '**/*.Script' )
    .option( '-f, --file <path> [files...]', 'Instrument a file', collect, [] )
    .option( '-u, --unmangled', "Don't mangle function identifiers" )
    .option( '-m, --manglefile <file>', "Write unmangled function identifiers to <file>", "mangled.txt" )
    .parse(process.argv);

var mangler = null,
    getMangledIDs = null;

function Mangler() { 
    var idToName = {};
    var nextID = 0;
    
    return { 
        assigner: function(scriptPath, functionName) { 
            idToName[nextID] = scriptPath + functionName;
            return nextID++;
        },
        getIDs: function() { 
            return idToName;
        }
    };
}

main();

function main() { 

    if( !program.unmangled ) { 
        var t = Mangler();
        mangler = t.assigner;
        getManagledIDs = t.getIDs;
    }
    var glob_options = { root: program.base };

    if( program.file.length ) { 
        process.nextTick( processFiles.bind( null, program.file, onAllFilesDone ) );
    }
    else if( program.search ) { 
        glob( program.search, glob_options, function onGlob( err, files ) { 
            if( err ) {
                console.error( err );
            }
            else { 
                processFiles( files, onAllFilesDone );
            } 
        } );
    }
}

function onAllFilesDone( err ) { 
    if( err ) { 
        console.log( "Error during processing: ", err );
    }   
    else {
        if( !program.unmangled ) {
            console.log( "Writing mangled names file..." );
            fs.writeFileSync( program.manglefile, JSON.stringify( getMangledIDs() ), { encoding: 'utf8' } );
        }
        console.log( "Done" );
    }
}

function startParse( path, donecb ) { 
    fs.readFile( 
        path, 
        { encoding: 'utf8' }, 
        function doneReadingFile( err, content ) { 
            if( err ) donecb( err );
            onReadFile( path, content, donecb );
        }
    )
}

function onReadFile( path, contents, donecb ) { 
    var p = Parser( [] ), parseTree, funcID;
    
    try { 
        parseTree = p.parse( contents );
        funcID = path.replace( /^.*ospace_src\//, '' ).replace( /\//g, "::" ).replace( /Script$/, "" );
    }
    catch( e ) { 
        
        var err = {
            file: path,
            error: e };
    
        donecb( err );
        return;
    }

    var instrumentedCode = instrument( funcID, contents, parseTree, mangler );
    
    fs.writeFile( path, instrumentedCode, { encoding: 'utf8' }, 
        function doneWriting(err) {
            if( err ) {
                donecb( err );
            }
            else { 
                console.log( "Instrumented ", path );
                donecb();
            }
        } 
    );
}

function processFiles( files, allDoneCB ) {
    async.eachLimit( files, 10, startParse, allDoneCB );   
}