var should = require( 'should'),
    assert = require( 'assert'),
    Module = require( '../src/module' );

describe( 'Module', function() {
    describe( '#constructor', function() {
        it( 'should throw error for invalid module', function() {
            ( function() {
                new Module( "notamodule", "c:/opentext/sharedsc/" );
            } ).should.throw();
        } );
    } );
    describe( '#getStartupScripts()', function() {
        it( 'should find all startup scripts', function() {
            var mod = new Module( "replicator", "c:/opentext/sharedsc/"  );
            mod.getStartupScripts().should.eql( [ "c:/opentext/sharedsc/replicator/ospace_src/Replicator Root/Startup.Script" ] );
        } );
    } );
    describe( '#getScripts()', function() {
        it( 'should find all scripts', function() {
            var mod = new Module( "syntergycore", "c:/opentext/sharedsc/" );
            mod.getScripts().should.be.an.Array.and.not.empty;
        } );
    } );
});
