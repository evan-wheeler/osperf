var should = require( 'should'),
    assert = require( 'assert'),
    Bannockburn = require( '../../bannockburn'),
    coverage = require( '../src/instrument/coverage.js' );

var p = Bannockburn.Parser();

describe( 'Coverage', function() {
    describe( '#coverage()', function() {
        it( 'should correctly handle for statements', function() {
            var src = "for i = 1 to 100\ni += 1\nend";
            coverage( src, p.parse( src ) ).result.should.equal( "for i = 1 to 100\ni += 1\nend" );
        } );
    } );
});