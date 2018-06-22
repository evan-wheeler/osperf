let _ = require("lodash");

module.exports = function CompileSource(content) {
    let lineIndex = 0;
    let lines = content.replace(/\r\n|\r|\n/g, "\n").split("\n");

    function nextLine() {
        return lines[lineIndex++];
    }

    let homeLen = 0,
        homePath = "",
        len = 0,
        lineNumber = 0,
        result,
        s = "",
        skippedLines = [],
        startArgs = 0,
        tmpList = [],
        trimmed,
        fileCommentStart = undefined,
        fileCommentEnd = undefined,
        skippingHeaderComments = true;

    while (skippingHeaderComments && !_.isNil((s = nextLine()))) {
        trimmed = s.trim();
        len = trimmed.length;

        if (len == 0) {
            skippedLines.push("");
        } else if (len >= 2 && trimmed.substr(0, 2) == "//") {
            skippedLines.push("");
        } else if (len >= 3 && trimmed.substr(0, 3) == "/*|") {
            skippedLines.push("");
        } else {
            skippingHeaderComments = false;
        }

        lineNumber += 1;
    }

    let currentWebScript = "";
    let explicitWebscriptFound = false;

    let langHTML = false;
    let withinAWebScript = false;

    let langStack = [];
    let currLang = "OScript";
    let currLangOpts = [];

    let oscriptLine = "";
    let oscriptLines = [];
    let literalIndex = 0;
    let literalLines = [];
    let literalLine = "";

    let emitBlankNopLine = "";
    let emitCRLF = "\r\n";

    let literalAdded = false; // TRUE if the current line is a literal
    let litParamList = ""; // holds accumulated literal parameters

    let BeginScript = "<SCRIPT";
    let EndScript = "/SCRIPT>";
    let WithinScript = false;

    //
    //	All header lines are skipping and (s/trimmed) contains a real source line.
    //
    //	Note that if an explicit webscript command is to be used, it must be placed
    //	here. Otherwise, a default one will be inserted.
    //

    if (skippingHeaderComments) {
        console.log("No body found, only comments and blank lines");
        return "";
    }

    //
    //	If this isn't an explicit 'webscript', then generate a webscript line and force
    //	the first line to be deferred.
    //

    let deferredLine = undefined;

    if (len >= 11 && trimmed.substr(0, 11) == ";;webscript") {
        explicitWebscriptFound = true;
        oscriptLines.push("");
        lineNumber += 1;
    } else {
        deferredLine = trimmed;
        s = ";;webscript _Implicit";
        trimmed = s;
        len = trimmed.length;
    }

    while (true) {
        literalAdded = false;
        oscriptLine = "";

        if (len == 0) {
            if (langHTML) {
                oscriptLine = emitBlankNopLine;
            }
        } else {
            let ch = trimmed.charAt(0);

            if (len == 1) {
                if (ch == ";") {
                    //
                    //	Semicolon always forces OScript, no matter what the current mode
                    //
                    oscriptLine = emitBlankNopLine;
                } else if (ch == "%") {
                    //
                    //	Percent (%) always forces HTML, no matter what the current mode
                    //

                    if (withinAWebScript) {
                        literalLine += emitCRLF;
                        literalAdded = true;
                    } else {
                        throw Error(
                            "HTML can only be used within a ;;webscript"
                        );
                    }
                } else if (langHTML) {
                    //
                    //	Single character doesn't deserve a literal entry.
                    //
                    literalLine += trimmed + emitCRLF;
                    literalAdded = true;
                } else {
                    oscriptLine = trimmed;
                }
            } else if (len >= 2 && trimmed.substr(0, 2) == "//") {
                //
                // The defaults for this elseif branch delete any OScript or JavaScript Comments
                //
                // If we are debugging then leave the comments in only if we are in a JavaScript block
                //

                if (WithinScript) {
                    literalLine = trimmed + emitCRLF;
                    literalAdded = true;
                }
            } else {
                if (ch == ";") {
                    //
                    //	Semicolon always forces OScript, no matter what the current mode
                    //
                    if (trimmed.charAt(1) == ";") {
                        trimmed = trimmed.substring(2);
                        len = trimmed.length;

                        //
                        //	Must be a webscript directive.
                        //
                        if (len >= 9 && trimmed.substr(0, 9) == "webscript") {
                            if (withinAWebScript) {
                                throw Error(
                                    ";;webscript directive found without previous ;;end"
                                );
                            } else if (langStack.length !== 0) {
                                throw Error(
                                    ";;webscript directive found within language block."
                                );
                            } else {
                                //
                                // Common code for all WebScripts
                                //
                                oscriptLine =
                                    "function " + trimmed.substring(10);
                                startArgs = oscriptLine.indexOf("(");
                                if (startArgs >= 0) {
                                    currentWebScript = oscriptLine.substring(
                                        0,
                                        startArgs
                                    );
                                    oscriptLine = oscriptLine.replace(
                                        "(",
                                        "(Object _t,"
                                    );

                                    startArgs = _.lastIndexOf(
                                        oscriptLine.split(""),
                                        ")"
                                    );

                                    oscriptLine = oscriptLine.substring(
                                        0,
                                        startArgs - 1
                                    );
                                } else {
                                    currentWebScript = oscriptLine;
                                    oscriptLine = oscriptLine + "(Object _t";
                                }

                                oscriptLine +=
                                    ",...);List _l=_t.fLiterals;Dynamic _f=_t.fOutput;";
                                withinAWebScript = true;
                                currLang = "HTML";
                                langHTML = true;
                            }
                        } else if (len == 3 && trimmed == "end") {
                            if (withinAWebScript) {
                                if (explicitWebscriptFound) {
                                    oscriptLine = "end";
                                    withinAWebScript = false;
                                    langHTML = false;
                                    if (fileCommentEnd) {
                                        // the filename comment must come before the ';;end' statement
                                        literalLine +=
                                            fileCommentEnd + emitCRLF;
                                    }
                                } else {
                                    throw error(
                                        ";;end directive found without previous explicit ;;webscript."
                                    );
                                }
                            } else if (langStack.length != 0) {
                                throw error(
                                    ";;end directive found within language block."
                                );
                            } else {
                                throw error(
                                    ";;end directive found without previous ;;webscript."
                                );
                            }
                        } else if (len == 5 && trimmed == "html{") {
                            if (withinAWebScript) {
                                langStack.push([currLang, currLangOpts]);
                                currLang = "HTML";
                                currLangOpts = {};
                                langHTML = true;
                            } else {
                                throw error(
                                    "HTML directive not available outside of a webscript."
                                );
                            }
                        } else if (len == 8 && trimmed == "oscript{") {
                            langStack.push([currLang, currLangOpts]);
                            currLang = "OScript";
                            currLangOpts = {};
                            langHTML = false;
                        } else if (len == 1 && trimmed == "}") {
                            if (langStack.length == 0) {
                                console.log("Extra ;;} ignored.");
                            } else {
                                currLang = langStack[langStack.length - 1][0];
                                currLangOpts =
                                    langStack[langStack.length - 1][1];
                                langStack.pop();
                                langHTML = currLang != "OScript";
                            }
                        } else if (
                            len >= 5 &&
                            trimmed.substr(0, 5) == "call "
                        ) {
                            // call joe( args )
                            trimmed = trimmed.substring(5).trim();

                            //
                            //	If there are angle brackets, then use the expression inside as
                            //	a filespec for use by Call.
                            //

                            let calledFile = "";
                            let calledFunction = "";

                            if (trimmed.charAt(0) === "<") {
                                startArgs = trimmed.indexOf(">");

                                if (startArgs >= 0) {
                                    calledFile = trimmed.substring(
                                        1,
                                        startArgs
                                    );
                                    trimmed = trimmed.substring(startArgs + 1);
                                } else {
                                    throw error(
                                        "Missing closing '>' in call filespec: " +
                                            trimmed
                                    );
                                }
                            } else {
                                startArgs = trimmed.indexOf("(");
                                if (startArgs >= 0) {
                                    calledFunction = trimmed.substring(
                                        0,
                                        startArgs
                                    );
                                    trimmed = trimmed.substring(startArgs);
                                } else {
                                    calledFunction = trimmed;
                                    trimmed = "";
                                }
                            }

                            let argList = "";
                            let comma = "";

                            startArgs = trimmed.indexOf("(");
                            if (startArgs >= 0) {
                                startArgs = _.lastIndexOf(
                                    trimmed.split(""),
                                    ")"
                                );
                                if (startArgs >= 0) {
                                    argList = trimmed
                                        .substring(1, startArgs)
                                        .trim();

                                    if (argList != "") {
                                        comma = ",";
                                        // argList = argList
                                    }
                                } else {
                                    throw error(
                                        "Missing closing ')' in call argument list: " +
                                            trimmed
                                    );
                                }
                            } else {
                                argList = "";
                            }

                            if (calledFunction != "") {
                                oscriptLine =
                                    calledFunction +
                                    "(_t" +
                                    comma +
                                    argList +
                                    ")";
                            } else if (calledFile != "") {
                                oscriptLine =
                                    "$WebLingo.WebScript.RunFileWithArglist(" +
                                    calledFile +
                                    ",_f,this,{" +
                                    argList +
                                    "})";
                            }
                        } else {
                            throw error(
                                "Unknown WebLingo directive: " + trimmed
                            );
                        }
                    } else {
                        oscriptLine = trimmed.substring(1);
                    }
                } else if (ch == "%") {
                    //
                    //	Percent (%) always forces HTML, no matter what the current mode
                    //

                    if (withinAWebScript) {
                        tmpList = CompileHTMLString(
                            oscriptLines.length + 1,
                            trimmed.substring(1)
                        );

                        literalLine += tmpList[1] + emitCRLF;
                        literalAdded = true;

                        if (tmpList[0] > 0) {
                            // tmpList[ 1 ] =  number of parameters
                            // remove "{" "}" from parameter list tmpList[ 3 ]
                            litParamList = _AddParameter(
                                litParamList,
                                tmpList[2].substring(1, tmpList[2].length - 1)
                            );
                        }
                    } else {
                        throw error(
                            "% HTML command found outside of a ;;webscript."
                        );
                    }
                } else {
                    if (langHTML) {
                        tmpList = CompileHTMLString(
                            oscriptLines.length + 1,
                            trimmed
                        );

                        literalLine += tmpList[1] + emitCRLF;
                        literalAdded = true;

                        if (tmpList[0] > 0) {
                            // tmpList[ 1 ] = number of parameters

                            // remove "{" "}" from parameter list tmpList[ 3 ]
                            litParamList = _AddParameter(
                                litParamList,
                                tmpList[2].substring(1, tmpList[2].length - 1)
                            );
                        }
                    } else {
                        oscriptLine = trimmed;
                    }
                }

                // Look for a <SCRIPT > ... </SCRIPT> block
                //
                // look for '<SCRIPT'
                if (_.startsWith(trimmed.toUpperCase(), BeginScript)) {
                    WithinScript = true;
                }

                // look for '/SCRIPT>'

                if (_.endsWith(trimmed.toUpperCase(), EndScript)) {
                    WithinScript = false;
                }
            }
        }

        if (literalLine.length > 0) {
            // If we have a pending literal then add this first

            literalLines.push(literalLine);
            literalIndex = literalLines.length;
            oscriptLines.push(_FormatLiterals(literalIndex - 1, litParamList));
            lineNumber += 1;
            literalLine = "";
            litParamList = "";
        }

        if (!literalAdded) {
            //if this is a non-literal then add it to the oscript

            lineNumber += 1;
            oscriptLines.push(oscriptLine); // now add the non-literal line
        }

        if (fileCommentStart) {
            s = fileCommentStart;
            trimmed = s.trim();
            len = trimmed.length;
            fileCommentStart = undefined;
        } else if (deferredLine) {
            s = deferredLine;
            trimmed = s.trim();
            len = trimmed.length;
            deferredLine = undefined;
        } else if (_.isNil((s = nextLine()))) {
            break;
        } else {
            trimmed = s.trim();
            len = trimmed.length;
        }

        if (!explicitWebscriptFound && fileCommentEnd) {
            // if we are not in an explicit webscript then tack the file comment on the end
            literalLine += fileCommentEnd + emitCRLF;
            fileCommentEnd = undefined;
        }

        if (literalLine.length > 0) {
            // add any final literals

            literalLines.push(literalLine);
            literalIndex = literalLines.length;
            oscriptLines.push(_FormatLiterals(literalIndex - 1, litParamList));
            lineNumber += 1;
            literalLine = "";
            litParamList = "";
        }
    }

    // closeFile

    tmpList = [];

    if (langStack.length != 0) {
        throw error("End of file found within language block");
    } else if (withinAWebScript) {
        if (explicitWebscriptFound) {
            throw error("End of file found without closing ;;end");
        } else {
            tmpList = ["end"];
        }
    }

    result = [skippedLines.concat(oscriptLines, tmpList), literalLines];

    return result;
};

function CompileHTMLString(lineNumber, s) {
    let argString = "";
    let e = "";
    let elen;
    let fmtString = "";
    let len;
    let result = [];
    let tmpS;

    let istoken = false;
    let remainder = s;

    result = remainder.split("`");
    len = result.length;

    if (len === 1) {
        result = [0, remainder, ""];
    } else {
        len = 0;

        for (e of result) {
            if (istoken) {
                let expansionType = "H";
                len = len + 1;
                elen = e.length;
                if (elen === 0) {
                    console.log(s);
                } else {
                    if (elen >= 2 && e.charAt(0) === "%") {
                        expansionType = e.charAt(1);
                        e = e.substring(2);
                    }

                    argString += e + ",";
                    fmtString += "`" + expansionType;
                }
            } else {
                fmtString = fmtString + e;
            }

            istoken = !istoken;
        }

        if (!istoken) {
            console.log("ERROR...Mismatched delim on line: ", lineNumber);
            console.log("  line=", s);
        } else {
            result = [
                len,
                fmtString,
                "{" + argString.substr(0, argString.length - 1) + "}"
            ];
        }
    }

    return result;
}

function _FormatLiterals(literalIndex, paramString) {
    let retString = "Web.Write(_f, _l[" + literalIndex + "]";

    if (paramString.length > 0) {
        retString += ",{" + paramString + "}";
    }
    retString += ")";
    return retString;
}

function _AddParameter(parameterString, parameter) {
    if (parameter.length > 0) {
        if (parameterString.length > 0) {
            parameterString += ",";
        }
        parameterString += parameter;
    }
    return parameterString;
}
