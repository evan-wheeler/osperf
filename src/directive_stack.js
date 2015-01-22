function DirectiveStack() { 
    this._stack = [];
    this._on = true;
}

DirectiveStack.prototype = { 
    push: function( val ) { 
        if( !val ) { 
            this._on = false;
        }
        this._stack.push( val );
    },
    
    invert: function() { 
        var i =  this._stack.length - 1;
        if( i < 0 ) {
            throw "stack is empty";
        }
        this._stack[i] = !this._stack[i];
        this._on = this._calcOn();
    },
    
    pop: function() { 
        this._stack.pop();
        this._on = this._calcOn();
    },
    
    empty: function() {
        return this._stack.length === 0;
    },
    
    on: function() { 
        return this._on;
    },
    
    _calcOn: function() {
        var s = this._stack;
        var i = s.length; 
        while( i-- ) { 
            if( !s[i] ) {
                return false;
            }            
        }   
        return true;
    }
};

module.exports = DirectiveStack;