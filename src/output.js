"use strict";
var ExecStatus;
(function (ExecStatus) {
    ExecStatus[ExecStatus["unknown"] = 0] = "unknown";
    ExecStatus[ExecStatus["replaced"] = 1] = "replaced";
    ExecStatus[ExecStatus["verified"] = 2] = "verified";
    ExecStatus[ExecStatus["unsolved"] = 3] = "unsolved";
})(ExecStatus || (ExecStatus = {}));
var ExecType;
(function (ExecType) {
    ExecType[ExecType["CAPI.Exec"] = 0] = "CAPI.Exec";
    ExecType[ExecType["CAPI.ExecN"] = 1] = "CAPI.ExecN";
    ExecType[ExecType["ExecSQL"] = 2] = "ExecSQL";
    ExecType[ExecType["Exec"] = 3] = "Exec";
})(ExecType || (ExecType = {}));
class ExecInfo {
    constructor() {
        this.code = "";
        this.corrections = [];
        this.status = ExecStatus.unknown;
    }
}
class Output {
    constructor() {
        this.curFile = "";
        this.curExec = {
            code: "",
            corrections: [],
            status: ExecStatus.unsolved
        };
    }
    startFile(filename) {
        if (this.curFile !== "") {
            this.endFile();
        }
        this.curFile = filename;
        console.log(``);
    }
    newExec(code, execType) { }
    endFile() {
        if (this.curFile === "") {
            return;
        }
        this.curFile = "";
    }
}
