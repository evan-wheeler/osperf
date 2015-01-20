var assert = require("assert"),
    should = require("should"),
    Macros = require( '../src/macros' );
    
describe('Macros', function(){
  describe('#define()', function(){
    it('should define macros', function(){
      ( new Macros() ).define( "A", [ "B", "C" ] ).isDefined( "A" ).should.equal( true );
    });
    it( 'should work with a valueFn defined', function() { 
       ( new Macros( { valueFn: function(v) { return v.value; } } ) )
            .define( { value: "A" }, [ { value: "B" } ] )
            .isDefined( { value: "A" } ).should.equal( true );
    });
  })
  
  describe( "#undef()", function() { 
    it( "should remove defined macros", function() { 
      ( new Macros() ).define( "A", [ "B", "C" ] ).undef( "A" ).isDefined( "A" ).should.equal( false );
    } );
    it( "should work with a valueFn defined", function() { 
      ( new Macros( { valueFn: function(v) { return v.value; } } ) )
            .define( { value: "A" }, [ { value: "B" } ] )
            .undef( { value: "A" } )
            .isDefined( { value: "A" } ).should.equal( false );
    } );
  } );

  describe( "#evaluate()", function() { 
    it( "should evaluate simple macros", function() { 
      ( new Macros() ).define( "A", [ "B", "C" ] ).evaluate( "A" ).should.eql( [ "B", "C" ] );
    } );
    it( "should evaluate deep macros", function() { 
      ( new Macros() ).define( "A", [ "B", "C" ] ).define( "B", [ "D", "C" ] ).evaluate( "A" ).should.eql( [ "D", "C", "C" ] );
    } );
    it( "should detect cycles in recursive macros", function() { 
      ( function() { ( new Macros() ).define( "A", [ "B", "C" ] ).define( "B", [ "D", "C" ] ).define( "C", [ "A" ] ).evaluate( "A" ) } ).should.throw();
    } );
    it( "should work with a valueFn defined", function() { 
       ( new Macros( { valueFn: function(v) { return v.value; } } ) )
            .define( { value: "A" }, [ { value:"B"}, {value:"C"} ] ).evaluate( {value:"A"} ).should.eql( [ {value:"B"}, {value:"C"} ] );
    } );
    it( "should work with isEvalItem defined", function() { 
       ( new Macros( { canEvalItem: function(v) { return v !== '+'; } } ) )
            .define( "A", [ "B", "+", "C" ] ).define( "+", "D" ).evaluate( "A" ).should.eql( [ "B", "+", "C" ] );
    } );
  } );
})
