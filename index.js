var fs = require( 'fs' ),
    Parser = require( './src/parser' ),
    instrument = require( './src/instrument' ),
    glob = require("glob"),
    program = require('commander');
    
function collect(val, list) {
  list.push(val);
  return list;
}

program.version('0.0.1')
    .option( '-b, --base <dir>', 'Base path to search', process.cwd() )
    .option( '-s, --search <pattern>', 'Instrument files that match the specified glob [**/*.Script]', '**/*.Script' )
    .option( '-f, --file <path> [files...]', 'Instrument a file', collect, [] )
    .parse(process.argv);

var glob_options = { root: program.base };

if( program.file.length ) { 
    process.nextTick( processFiles.bind( null, null, program.file ) );
}
else if( program.search ) { 
    glob( program.search, glob_options, processFiles );
}

function startParse( path ) { 
    fs.readFile( path, { encoding: 'utf8' }, onReadFile.bind( null, path ) )
}

function onReadFile( path, err, contents ) { 
    if( err ) { 
        console.error( "Error onReadFile: ", err );
        return;
    }
    
    var p = Parser( [] ), parseTree, funcID;
    
    try { 
        parseTree = p.parse( contents );
        funcID = path.replace( /^.*ospace_src\//, '' ).replace( /\//g, "." );
        console.log( "Instrumenting ", path );
    }
    catch( e ) { 
        console.error( "Caught Exception: ", e.message, ", line: ", e.line );
        return
    }
    
    fs.writeFile( path, instrument( funcID, contents, parseTree ), { encoding: 'utf8' }, onWroteFile.bind( null, path ) );
}

function onWroteFile( path, err ) { 
  if (err) { 
    console.error( "Error: ", err );
    return;
  } 
  console.log( "Saved ", path );
}

function processFiles( err, files ) {
    files.forEach( startParse );
}