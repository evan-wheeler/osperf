var fs = require( 'fs'),
    path = require( 'path'),
    zlib = require( 'zlib' );
    Module = require( '../module'),
    IDGenerator = require( '../idgen'),
    Q = require( 'q' ),
    fs = require( 'fs'),
    async = require( 'async'),
    instrument = require( "../instrument/profile"),
    _ = require( 'lodash'),
    parseUtils = require( '../parseutils' );

/**
 * Add profiler data to modules.
 * @param modules
 * @param options
 * @returns {!Promise.<RESULT>|*}
 */
var profile = module.exports = function( modules, options ) {
    'use strict';

    if( !_.isArray( modules ) ) {
        modules = [ modules ];
    }

    var gen = new IDGenerator(),
        modObjs = modules.map( function(modName ) { return new Module( modName, options.base ); } )

    return parseUtils.listScriptsInModules( modObjs )
        .then( function( allFiles ) {
            return processFiles( allFiles, gen );
        })
        .then( function() {
            modObjs.forEach( function(m) {
                addHeader( m.getStartupScripts(), JSON.stringify( gen.getIDs() ) );
            } );

            return true;
        });
}

/**
 * Process all the source files.
 * @param srcFiles
 * @param idGenerator
 * @returns {!Promise.<RESULT>|*}
 */
function processFiles( srcFiles, idGenerator ) {
    'use strict';
    return Q.nfcall( async.mapLimit, srcFiles, 4, processEach.bind(null,idGenerator) );
}

/**
 * Process parse/instrument each file
 * @param file
 * @param done
 */
function processEach( idGenerator, file, done ) {

    console.log( "Parsing file: ", file );
    parseUtils.parseFile(file).then( function( parseResult ) {

        var scriptID = file.replace( /^.*ospaces?_src\//, '' ).replace( /\//g, "::" ).replace( /Script$/, "" );

        // adapt our function ID generator for this file.
        var funcIDGen = function ( funcID ) {
            return idGenerator.newID( scriptID + funcID );
        };

        // instrument the code.
        var result = instrument( parseResult.src, parseResult.ast, funcIDGen );

        // write the modified code back to the original file.
        fs.writeFileSync( file, result, 'utf8' );

        // just return the block & function data.
        done( null, true);
    } )
    .catch( function(e) {
        // don't kill the whole process.
        console.error( "Problem instrumenting file. ", e, " in file: ", file );
        done( e );
    })
    .done();
}

function addHeader( startupFiles, mapEntries ) {
    var mapFeature = "__fProfilerFuncMap";

    var code =
        "/* Begin profiler setup */\r\n" +
        "if IsUndefined( $_P )\r\n" +
        "   Script __i = Compiler.Compile( 'function I(String n,Dynamic t);Integer tk,u,ms,us;Frame p=$_P;tk=Date.Tick();u=Date.MicroTick();ms=tk-p.lastTick;us=u-p.lastMicro;p.lastTick=tk;p.lastMicro=u;File.Write(p._fOutput,Str.Format(''>%1,%2,%3'',n,ms,us));end')\r\n" +
        "   Script __o = Compiler.Compile('function O(String n);Integer tk,u,ms,us;Frame p=$_P;tk=Date.Tick();u=Date.MicroTick();ms=tk-p.lastTick;us=u-p.lastMicro;p.lastTick=tk;p.lastMicro=u;File.Write(p._fOutput,Str.Format(''%1,%2,%3'',n,ms,us));end')\r\n" +
        "   String __lp = $Kernel.SystemPreferences.GetPrefGeneral( 'Logpath' )\r\n" +
        "   String __logf=Str.Format( '%1profile_%2.out',( __lp[1] == '.' && __lp[2] in {'/', '\\'}?$Kernel.ModuleUtils._OTHome()+__lp[3:]:__lp),System.ThreadIndex())\r\n" +
        "   File __tf = File.Open( __logf, File.WriteMode )\r\n" +
        "   if IsError( __tf )\r\n" +
        "       Echo( 'Profiler could not open ', __logf, ' for writing: ', __tf )\r\n";

    if( mapEntries ) {
        code +=
            "   else\r\n" +
            "      File.Write( __tf, ." + mapFeature + " )\r\n";
    }
    code += "   end\r\n" +
        "   $_P = Frame.New( {}, { { 'lastTick', 0 }, { 'lastMicro', 0 }, { '_fOutput', __tf }, { 'I', __i }, { 'O', __o } } )\r\n" +
        "end\r\n " +
        "/* End profiler setup */\r\n";

    startupFiles.forEach( function( f ) {
        var content = fs.readFileSync( f, { encoding: "utf8" } );
        var startStr = "/* Begin profiler setup */";

        if( content.indexOf( startStr ) === -1 ) {
            fs.writeFileSync( f, code + content, { encoding: "utf8" } );

            if( mapEntries ) {
                // create a new feature to store the decoded function names.
                var mapFile = path.join( path.dirname( f ), mapFeature + ".String" );
                writeMapFile( mapFile, mapEntries );
            }
        }
    } );
}

function writeMapFile( destFile, mapEntries ) {
    var input = JSON.stringify( mapEntries );

    zlib.deflate( input, function( err, buffer ) {
        if( !err ) {
            fs.writeFileSync( destFile, buffer.toString( 'base64' ), { encoding: 'utf8' } );
        }
    } );
}