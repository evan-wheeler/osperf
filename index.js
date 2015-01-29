var fs = require( 'fs' ),
    Parser = require( './src/parser' ),
    instrument = require( './src/instrument' ),
    glob = require("glob"),
    program = require('commander'),
    async = require( 'async' ),
    _ = require( 'lodash' ),
    zlib = require( 'zlib' );
    
function collect(val, list) {
  list.push(val);
  return list;
}

// By default, ignores Documentation.Script, /__Init.Script, Root/Startup.Script, and scripts that begin with a number.

var defaultIgnore = /.*(?:(?:[\\/][ a-zA-Z0-9_]+[ ]?Root[\\/]Startup)|(?:[\\/]\_\_[Ii]nit)|([\\/][0-9][0-9a-zA-Z_]*)|(?:[\\/]Documentation))\.Script$/,
    defaultProfilerFile = /.*[\\/][ a-zA-Z0-9_]+[ ]?Root[\\/]Startup\.Script$/;

program.version('0.0.1')
    .option( '-s, --search <pattern>', 'Instrument files that match the specified glob [**/*.Script]', '**/*.Script' )
    .option( '--profiler <regex>', 'Create profiler globals in files matching <regex>', defaultProfilerFile )
    .option( '-i, --ignore <regex>', 'Do not instrument files matching <regex>', defaultIgnore )
    .option( '-u, --uncompressed', "Do not compress function identifiers" )
    .option( '-m, --mapfile <file>', "Write uncompressed function identifiers to <file>" )
    .option( "-v, --verbose", "Turn on verbose output" )
    .parse(process.argv);

var mangler = null,
    getMangledIDs = null;

function Mangler() { 
    var idToName = {};
    var nextID = 0;
    var chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ;:=?@!~#$%&+-[]()_|{}";
    var base = chars.length;
    
    function compress(val) { 
        var str = "";
        while( val >= base ) { 
            var r = val % base,
                val = Math.floor( val / base );
            str += chars.charAt( r );
        }
        return str + chars.charAt( val );
    }
    
    return { 
        assigner: function(scriptPath, functionName) { 
            var fID = compress( nextID++ );
            idToName[fID] = scriptPath + functionName;
            return fID;
        },
        getIDs: function() { 
            return idToName;
        }
    };
}

main();

function main() { 

    if( !program.uncompressed ) { 
        var t = Mangler();
        mangler = t.assigner;
        getMangledIDs = t.getIDs;
    }
    var glob_options = {};

    if( program.search ) { 
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

function onAllFilesDone( profilerInstallFiles ) { 

    var decodedIDs = null;
    
    if( !program.uncompressed ) {
    
        decodedIDs = getMangledIDs();
                
        if( program.mapfile ) { 
            if( program.verbose ) {
                console.log( "Writing compressed names file..." );
            }
        
            // write out all the uncompressed function names to the map file.
            fs.writeFileSync( program.mapfile, JSON.stringify( decodedIDs ), { encoding: 'utf8' } );
        }
    }
    
    if( profilerInstallFiles.length ) { 
        if( program.verbose ) {
            console.log( "Installing profiler globals..." );
        }
        
        // Add the profiler globals (and decoded IDs if we're in compressed mode)
        addGlobalCode( profilerInstallFiles, decodedIDs );
    }
    
    console.log( "Done" );
}

function startParse( path, donecb ) { 
    fs.readFile( 
        path, 
        { encoding: 'utf8' }, 
        function doneReadingFile( err, content ) { 
            if( err ) { 
                donecb( err );
            }
            else {
                onReadFile( path, content, donecb );
            }
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
        e.file = path;
        donecb( e );
        return;
    }

    var instrumentedCode = instrument( funcID, contents, parseTree, mangler );
    
    fs.writeFileSync( path, instrumentedCode, { encoding: 'utf8' } );
    
    if( program.verbose ) { 
        console.log( "Instrumented ", path );
    }
    
    donecb();
}

function filterFiles( files, pattern, invertFlag ) { 
    var filePattern, matches = [];
    
    if( _.isRegExp( pattern ) ) { 
        filePattern = pattern;
    }
    else if( _.iString( pattern ) ) { 
        filePattern = new RegExp( pattern );
    }
    
    if( filePattern ) { 
        matches = files.filter( function( f ) { 
            var result = filePattern.test( f );

            return invertFlag ? !result : result;
        } );
    }
    return matches;
}

function makeMappingFile( destFile, mapEntries ) { 
    var input = JSON.stringify( mapEntries ); 
    
    zlib.deflate( input, function( err, buffer ) { 
        if( !err ) { 
            fs.writeFileSync( destFile, buffer.toString( 'base64' ), { encoding: 'utf8' } );
        }
    } );
}

function getScriptFilePath( f ) { 
    var result = /^(.*[\\/])[^\\/]+\.Script$/.exec( f );
    
    if( result ) { 
        return result[1];
    }
    return null;
}

function addGlobalCode( profilerFiles, mapEntries ) { 

    var mapFeature = "__fProfilerFuncMap";
    
    var lines = [
        "/* Begin profiler setup */",
        "if IsUndefined( $_P )",
        "   Script __i = Compiler.Compile( 'function I(String n,Dynamic t);Integer tk,u,ms,us;Frame p=$_P;tk=Date.Tick();u=Date.MicroTick();ms=tk-p.lastTick;us=u-p.lastMicro;p.lastTick=tk;p.lastMicro=u;File.Write(p._fOutput,Str.Format(''>%1,%2,%3'',n,ms,us));end')",
        "   Script __o = Compiler.Compile('function O(String n);Integer tk,u,ms,us;Frame p=$_P;tk=Date.Tick();u=Date.MicroTick();ms=tk-p.lastTick;us=u-p.lastMicro;p.lastTick=tk;p.lastMicro=u;File.Write(p._fOutput,Str.Format(''%1,%2,%3'',n,ms,us));end')",
        "   String __lp = $Kernel.SystemPreferences.GetPrefGeneral( 'Logpath' )",
        "   String __logf=Str.Format( '%1profile_%2.out',( __lp[1] == '.' && __lp[2] in {'/', '\\'}?$Kernel.ModuleUtils._OTHome()+__lp[3:]:__lp),System.ThreadIndex())",
        "   File __tf = File.Open( __logf, File.WriteMode )",
        "   if IsError( __tf )",
        "       Echo( 'Profiler could not open ', __logf, ' for writing: ', __tf )",
        "   else",
        mapEntries ? "      File.Write( __tf, ." + mapFeature + " )" : "",
        "   end",
        "   $_P = Frame.New( {}, { { 'lastTick', 0 }, { 'lastMicro', 0 }, { '_fOutput', __tf }, { 'I', __i }, { 'O', __o } } )",
        "end",
        "/* End profiler setup */", 
        ""
    ];

    var code = lines.join( "\r\n" );

    profilerFiles.forEach( function( f ) { 
        var content = fs.readFileSync( f, { encoding: "utf8" } );
        
        var startStr = "/* Begin profiler setup */";
        if( content ) { 
            if( content.indexOf( startStr ) <= -1 ) {
                if( program.verbose ) { 
                    console.log( "Adding profiler globals to file: ", f );
                }
                
                // write the code to the beginning of the script.
                fs.writeFileSync( f, code + content, { encoding: "utf8" } );
                
                if( mapEntries ) {
                    // create a new feature to store the decoded function names.
                    var scriptPath = getScriptFilePath( f );
                    
                    if( scriptPath ) { 
                        makeMappingFile( scriptPath + mapFeature + ".String", mapEntries );
                    }
                    else { 
                        console.error( "Can't find path to script:", f );
                    }   
                }
            }
            else { 
                console.error( "Profiler code is already installed in file:", f );
            }
        }
        else { 
            console.error( "Can't read file:", f );
        }
    } );
}

function processFiles( files, allDoneCB ) {
    // find the file(s) where we will install the profiler Globals
    var profilerFiles = filterFiles( files, program.profiler );
    
    // find the files where we need to add instrumentation
    var instrumentFiles = program.ignore ? filterFiles( files, program.ignore, true ) : files;

    // process all the files.
    async.eachLimit( instrumentFiles, 10, startParse, function onErrOrDone( err ) { 
        if( err ) { 
            console.error( "Error during processing: ", err );
            return;
        }   
        // complete.
        process.nextTick( function() { 
            allDoneCB( profilerFiles ); 
        } );
    } );   
}