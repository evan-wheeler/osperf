var should = require( 'should'),
    assert = require( 'assert'),
    cover = require( '../src/commands/cover.js' );

describe( 'Cover', function() {
    describe( '#cover()', function() {
        it( 'should return a promise', function(done) {
            this.timeout(20000);
            cover( [ "replicator" ], { sourceDir: 'c:/opentext/sharedsc/' }).then( function() {
                done();
            })
            .catch( function( e ) {
                throw e;
            } )
            .done();
        } );
    } );
});
