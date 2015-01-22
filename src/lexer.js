function Lexer(){ 
    this.code = ""; 
    this.pos = 0;
}

module.exports = Lexer;

var LINE_COMMENT = 1,
    BLOCK_COMMENT = 2,
    SINGLE_STR = 3,
    DOUBLE_STR = 4,
    VARIABLE = 5,
    NUMBER_NO_DECIMAL = 6,
    NUMBER_DECIMAL = 7,
    ELLIPSIS = 8,
    OBJ_LITERAL = 9;

function makeToken( t, v, line, from, to, colFrom, colTo ) { 
    return { 
        type: t, 
        value: v, 
        line: line, 
        from: from, 
        to: to, 
        colFrom: colFrom, 
        colTo: colTo 
    };
}
    
Lexer.prototype = { 
    setInput: function( code ) {
        this.code = code.replace( /\r\n/g, '\n' ).replace( /\r/g, '\n' );
        this.line = 1;
        this.pos = 0;
        this.linePos = 0;
        this.done = ( this.code.length === 0 );
        this.curToken = null;
        this.indent = "";
    },
    
    readNextToken: function() { 
        var result = null,
            token = "",
            state = 0,
            eof = false,
            eat = false,
            continuation = false,
            nlInComment = false,
            ch = this.code.charAt( this.pos ),
            ch1 = this.code.charAt( this.pos + 1 ),
            addCommentNewline = false,
            from, colFrom, tmpLine = 0;
        
        if( ch1 === "" ) { 
            eof = true;
            this.pos++;
            ch1 = '\n';
        }
        
        if( ch === "" ) { 
            this.done = true;
        }
        
        while( this.done === false ) {
            switch( state ) { 
            case 0:
                from = this.pos;
                colFrom = this.linePos;

                // start state 
                if( ch === ';' ) {
                    result = makeToken( "(nl)", ch, this.line, from, this.pos, colFrom, this.linePos );
                }
                else if( ch === '\n' ) {
                    if( continuation ) {
                        continuation = false;
                        // skip newline.
                        token = "";
                    }
                    else {
                        result = makeToken( "(nl)", ch, this.line, from, this.pos, colFrom, this.linePos );
                    }
                }                
                else if( ch === '\\' ) { 
                    continuation = true;
                }     
                else if( ch === "/" && ch1 === "/" ) { 
                    state = LINE_COMMENT;
                }
                else if( ch === "/" && ch1 === "*" ) { 
                    eat = true;
                    state = BLOCK_COMMENT;
                    addCommentNewline = false;
                    nlInComment = false;
                }
                else if( ch === "'" ) { 
                    state = SINGLE_STR;
                }
                else if( ch === '"' ) { 
                    state = DOUBLE_STR;
                }
                else if( ch === '.' && ch1 === '.' ) { 
                    state = ELLIPSIS;
                    token = ".";
                }
                else if( /[_A-Za-z]/.test( ch ) && !/[_A-Za-z0-9]/.test( ch1 ) )  { 
                    result = makeToken( "name", ch, this.line, from, this.pos, colFrom, this.linePos );
                }
                else if( /[_A-Za-z]/.test( ch ) ) { 
                    state = VARIABLE;
                    token = ch;
                }
                else if( ch === "." && /[0-9]/.test( ch1 ) ) { 
                    state = NUMBER_DECIMAL;
                    token = ch;
                }
                else if( /[0-9]/.test( ch ) && ch1 === "." ) { 
                    state = NUMBER_NO_DECIMAL;
                    token = ch;
                }
                else if( /[0-9]/.test( ch ) && !/[0-9]/.test( ch1 ) ) { 
                    result = makeToken( "number", ch, this.line, from, this.pos, colFrom, this.linePos );
                }
                else if( /[0-9]/.test( ch ) ) { 
                    state = NUMBER_NO_DECIMAL;
                    token = ch;
                }
                else if( ch === '#' && /[0-9a-fA-F]/.test( ch1 ) ) { 
                    state = OBJ_LITERAL;
                    token = '#';
                }
                else if( ch === "$" && ch1 === "$" ) { 
                    result = makeToken( "operator", "$$", this.line, from, this.pos, colFrom, this.linePos );
                    eat = true;
                }
                else if( ch === "$" ) { 
                    result = makeToken( "operator", "$", this.line, from, this.pos, colFrom, this.linePos );
                }
                else if( ( "&^|+-*/%<>=!".indexOf( ch ) != -1 && ch1 === "=" ) ||
                   ( ch === "<" && ch1 === ">" ) || 
                   ( ch === "<" && ch1 === "<" ) || 
                   ( ch === ">" && ch1 === ">" ) || 
                   ( ch === "|" && ch1 === "|" ) ||
                   ( ch === "&" && ch1 === "&" ) ||
                   ( ch === "&" && ch1 === "&" ) ||
                   ( ch === "^" && ch1 === "^" ) ) {
                    result = makeToken( "operator", ch + ch1, this.line, from, this.pos, colFrom, this.linePos );
                    eat = true;
                }
                else if( "#{}/%*,.()[]?:<>!=+-^|&".indexOf( ch ) != -1 ) { 
                    result = makeToken( "operator", ch, this.line, from, this.pos, colFrom, this.linePos );
                }
                break;
            case 1: // LINE_COMMENT
                if( ch1 === '\n' ) {
                    if( !continuation ) { 
                        result = makeToken( '(nl)', "", this.line,from, this.pos, colFrom, this.linePos );
                    }
                    
                    // ignore comments.
                    eat = true;                    
                    state = 0;
                    token = "";
                }
                else { 
                    token += ch;
                }
                break;
            case 2: // BLOCK COMMENT
                if( ch === '*' && ch1 === '/' ) { 

                    // ignore comments.
                    state = 0;
                    token = "";
                    
                    // We want block comments to add one newline token if it contains a newline.
                    // However, if it only contains one newline and it was preceded by a continuation token,
                    // don't add the newline.
                    if( ( continuation === false && nlInComment ) || addCommentNewline ) {
                        result = makeToken( '(nl)', "", tmpLine || this.line, from, from, colFrom, colFrom );                    
                    }
                    
                    eat = true;
                }
                else { 
                    if( ch === '\n' ) {
                        if( nlInComment === false ) {
                            tmpLine = this.line;
                            from = this.pos; 
                            colFrom = this.linePos;
                        }
                        
                        // If this is >= second newline, and we're preceded by a continuation, add a newline.
                        addCommentNewline = continuation && nlInComment;
                        nlInComment = true;
                    }
                    token += ch;
                }
                break;
            case 3: // SINGLE_STR 
                if( ch === "'" && ch1 === "'" ) {   
                    token += "'";
                    eat = true;
                }
                else if( ch === "'" ) { 
                    result = makeToken( 'string', token, this.line, from, this.pos, colFrom, this.linePos );
                }
                else { 
                    token += ch;
                }
                break;                
            case 4: // DOUBLE_STR -- first ch will not be '"'
                if( ch === '"' && ch1 === '"' ) {   
                    token += '"';
                    eat = true;
                }
                else if( ch === '"' ) { 
                    result = makeToken( 'string', token, this.line, from, this.pos, colFrom, this.linePos );
                }
                else { 
                    token += ch;
                }
                break;                
            case 5: // VARIABLE
                token += ch;
                
                if( !/[_A-Za-z0-9]/.test( ch1 ) ) { 
                    result = makeToken( 'name', token, this.line, from, this.pos, colFrom, this.linePos );
                }
                break;
            case 6: // NUMBER_NO_DECIMAL
                if( ch === '.'  ) { 
                    if( /[0-9]/.test( ch1 ) ) {
                        token += '.';
                        state = NUMBER_DECIMAL;
                    }
                    else {
                        result = makeToken( 'number', token, this.line, from, this.pos, colFrom, this.linePos );
                    }
                }
                else if( !/[.0-9]/.test( ch1 ) ) {
                    result = makeToken( 'number', token + ch, this.line, from, this.pos, colFrom, this.linePos );
                }
                else {
                    token += ch;
                }                    
                break;
            case 7: // NUMBER_DECIMAL 
                if( !/[0-9]/.test( ch1 ) ) {
                    result = makeToken( 'number', token + ch, this.line, from, this.pos, colFrom, this.linePos );
                }
                else {
                    token += ch;
                }                    
                break;                
            case 8: // ELLIPSIS
                token += ch;
                
                if( ch1 != '.' ) { 
                    if( token != '...' ) { 
                        token = "...";
                    }
                    result = makeToken( 'operator', token, this.line, from, this.pos, colFrom, this.linePos );
                }
                
                break;
            case 9: // OBJ_LITERAL  -- #F1A981C3
                token += ch;
                
                if( !/[0-9a-fA-F]/.test( ch1 ) ) { 
                    result = makeToken( 'objref', token, this.line, from, this.pos, colFrom, this.linePos );
                }
                
                break;
            default:
                // skip these characters.
            }
           
            if( eof ) {
                this.pos++;
                break;
            }
            
            this.linePos++;
            
            // keep track of lines.
            if( ch === '\n' ) { 
                this.line++; 
                this.linePos = 0; 
            }

            if( eat ) { 
                this.linePos += 1;
                
                // consume the whole lookahead and keep track of lines.
                if( ch1 === '\n' ) { 
                    this.line++; 
                    this.linePos = 0; 
                }
                 
                this.pos += 2;
                ch = this.code.charAt( this.pos );
            }
            else {
                this.pos++;
                ch = ch1;
            }
            
            if( result ) {             
                // if we have a result now, just exit.
                break;
            }
            
            // update lookahead.
            ch1 = this.code.charAt( this.pos + 1 );

            // check for eof conditions.
            if( ch === "" ) { 
                // we must have consumed the lookahead and ran into the eof.
                break;
            }
            else if( ch1 === "" ) { 
                // lookahead is eof -- process one more character (set lookahead to newline).
                eof = true;
                ch1 = '\n';
            }
            eat = false;
        }
        
        if( ( !this.done && result === null ) ) {
            this.done = true;
        }
        
        return result;            
    },
        
    get: function() { 
        var rtn = null;
        if( this.curToken ) {
            rtn = this.curToken;
            this.curToken = null;
        }
        else { 
            rtn = this.readNextToken();
        }
        return rtn;
    },
    
    peek: function() { 
        if( !this.curToken ) {
            this.curToken = this.readNextToken();
        }
        return this.curToken;
    }
};
