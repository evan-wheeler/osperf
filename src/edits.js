var Edits = module.exports = function Edits(initialValue) { 
    this.origValue = initialValue;
    this.edits = [];
};

Edits.prototype.apply = function applyEdits() { 
    var edits = this.edits,
        code = "" + this.origValue;

    edits.sort( function( a, b ) { 
        return a.insert_pos - b.insert_pos;
    } );
    
    var buffers = [], i = -1, len = edits.length, lastPos = 0;
    
    while( ++i < len ) {
        var edit = edits[i];
        buffers.push( code.substring( lastPos, edit.insert_pos ) );
        buffers.push( edit.content );
        lastPos = edit.insert_pos;
    }
    
    if( lastPos < code.length ) {
        buffers.push( code.substring( lastPos, code.length ) );
    }   

    return buffers.join( "" );
};

Edits.prototype.insert = function( str, beforeIndex ) { 
    this.edits.push( { insert_pos: beforeIndex, content: str } );
};