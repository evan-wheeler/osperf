var Module = require("../module"),
  Q = require("q"),
  fs = require("fs"),
  async = require("async"),
  _ = require("lodash"),
  parseUtils = require("../parseutils"),
  Bannockburn = require("bannockburn"),
  path = require("path"),
  cmp = require("../compare"),
  EditList = require("../edits");

var tableNames = [
  "RegionMap",
  "DispositionHold",
  "BestBetsData",
  "ESS_RECORDS",
  "BestBetsSearch",
  "FILE_STATUS",
  "Collections",
  "HoldType",
  "AuditCollectionsItems",
  "OBJECT",
  "WorkerPackages",
  "OTDOCUMENTHold",
  "WorkerQueue",
  "RetStage",
  "WorkerQueuePending",
  "RIMSDBVersion",
  "WorkerQueueCurrent",
  "RIMSKeyworded",
  "WorkerQueueComplete",
  "RimsTables",
  "WorkerStatus",
  "RSI",
  "WFForms",
  "WorkerQueueChildren",
  "RSIEventSched",
  "WFFormsVersions",
  "DTreeExtractorVerify",
  "RSIKeywords",
  "WFFormsLock",
  "LLPolling",
  "RSIRuleCode",
  "REPL_USER_TO_PWS",
  "Recd_OperationSummary",
  "CSentry_Scans",
  "RSIStatus",
  "Recd_OpinionTracking",
  "Repl_Trigger_Disable",
  "KDual",
  "SPECIAL_CHARACTERS",
  "Recd_OpinionSummary",
  "REPL_OBJECT_SERVERS",
  "KID",
  "STORAGE",
  "Recd_SystemStatsSummary",
  "KLong",
  "TABLES",
  "Recd_AdminConfig",
  "KIni",
  "JurisdCode",
  "Recd_OperationTracking",
  "KState",
  "Justification",
  "INSERT_TEST",
  "Recd_Hot",
  "Repl_Object_Activity",
  "LLCache",
  "gdcRecycleBin",
  "RetCode",
  "searchstats_query",
  "Repl_Event_Times",
  "KUAF",
  "RSIJustify",
  "REPL_SERVER_CONFIG",
  "KUAFChildren",
  "RM_Queue",
  "REPL_MAIL_QUEUE",
  "KUAFPrefs",
  "RM_DispRejects",
  "searchstats_component",
  "REPL_HOME_SERVER",
  "KUAFRightsList",
  "RM_DispSnapshots",
  "searchstats_terms",
  "REPL_IMPORT_STATS",
  "KUAFProxy",
  "RM_PartRecords",
  "searchstats_slice",
  "REPL_EXPORT_STATS",
  "UserTabRights",
  "RM_RecordTypeData",
  "SYN_STATS",
  "REPL_NUMBER_SERVERS",
  "OldPasswords",
  "RM_DocRecType",
  "SYN_STATS_STAGING",
  "REPL_TEST",
  "DTreeCore",
  "RM_LINKRR",
  "REPL_DTREENOTIFY",
  "RM_LINKRS",
  "REPL_KUAF",
  "DTree",
  "RSIApproval",
  "LLProspector",
  "REPL_KUAFChildren",
  "DTreeDeleted",
  "RSIApprovalHistory",
  "LLProspectorRegistry",
  "REPL_KUAFPrefs",
  "DTreeACL",
  "RM_FixedRet",
  "LLProspectorData",
  "REPL_KUAFRightsList",
  "DTreeNotify",
  "ProvenanceType",
  "WWork",
  "REPL_KUAFProxy",
  "DVersData",
  "nulltest",
  "RM_Provenance",
  "WWorkACL",
  "REPL_UserTabRights",
  "RM_ProvenanceHistory",
  "WSubWork",
  "REPL_OldPasswords",
  "ProviderData",
  "RM_ClassJustify",
  "WSubWorkTask",
  "REPL_DTree",
  "dumdum",
  "ProviderRetry",
  "RM_KIni",
  "WWorkAudit",
  "Repl_DTreeACL",
  "ProviderConfirmMove",
  "RM_ObjectHold",
  "WMap",
  "REPL_APPLY_STATUS_JOB",
  "BlobData",
  "RM_DISPSETTINGS",
  "Repl_Object_X",
  "WMapTask",
  "REPL_ITEM_AUDIT",
  "BlobResData",
  "RM_DispResultsVers",
  "WData",
  "REPL_ITEM_AUDIT_RELATED",
  "LLAttrData",
  "RM_UserHold",
  "WLock",
  "REPL_AUTH",
  "LLAttrBlobData",
  "RM_UserHoldCriteria",
  "WFAttrData",
  "REPL_ADD_ACTIVITY_TMP",
  "CatRegionMap",
  "RM_StatusACL",
  "WFAttrDataVersions",
  "REPL_CONTRACT_DATA_LOCAL",
  "DCategories",
  "RTFConvertStats",
  "RM_HoldQuery",
  "WFComments",
  "REPL_IMPORT_HISTORY",
  "DAttributes",
  "RM_HoldQueryHistory",
  "WFDispositions",
  "REPL_EXPORT_HISTORY",
  "DCatAttrs",
  "RM_DispReviewers",
  "WIndexNotify",
  "REPL_PACKAGE",
  "DAuditNew",
  "RM_DispReviewComments",
  "WRightsList",
  "DAuditMore",
  "ArchivedWorkBase",
  "REPL_PKG_PART",
  "DiscussionID",
  "ArchivedWork",
  "DReadList",
  "WebActiveWorkBase",
  "REPL_PKG_STATUS",
  "DDelList",
  "WebActiveWork",
  "DTopicItems",
  "TodoBase",
  "REPL_PKG_STS_CD",
  "Assignees",
  "Todo",
  "ComponentSettings",
  "Todo2",
  "REPL_PKG_STATUS_ERR",
  "ProjectOverviewSettings",
  "REPL_TEST2",
  "Todo201",
  "IconBarDisplay",
  "WAuditTrail",
  "REPL_EXPORT_STAGING",
  "Nickname",
  "testId",
  "DFacet_Owner",
  "LLSystemData",
  "DFacet_ObjectType",
  "REPL_VIRTUAL",
  "DTreeMultilingual",
  "DFacet_ModifyDate",
  "MetadataLanguages",
  "DFacet_dc_1",
  "REPL_TRACKED_TABLE_INFO",
  "SystemLanguages",
  "SYN_JOB",
  "DFacet_dc_336",
  "WebNodesFilter",
  "test_dt",
  "DFacet_dc_2",
  "REPL_INSTALLED_TRIGGERS",
  "WebNodesDisplay",
  "DFacet_dc_3",
  "DSuggestExceptions",
  "DFacet_dc_4",
  "REPL_TRACKING_TABLES",
  "DDocumentClass",
  "DFacet_dc_5",
  "DFacetKeys",
  "DFacetCache",
  "DTESTDATES",
  "DDeletedItemsNodes",
  "DDocumentClassChildren",
  "DSuggestWords",
  "DSuggestWordsPending",
  "DColumnLocation",
  "WebNodes",
  "WebNodesCatalogs",
  "AgentConfig",
  "sysdiagrams",
  "AgentSchedule",
  "NotifyInterests2",
  "NotifyEvents",
  "LLEventQueue",
  "NotifyMessages",
  "CSentry_Events",
  "WebNodesMeta_en",
  "WebNodes_en",
  "CSentry_EventDefs",
  "WebNodesDeleted_en",
  "DDeletedItemsNames_en",
  "CSentry_EventDefFields",
  "WebNodesCatalogs_en",
  "CSentry_EventLog",
  "CSentry_EventCount",
  "Numbers",
  "CSentry_NormalUsage",
  "CSentry_Violations",
  "CSentry_LimitLevels",
  "CSentry_LimitDefs",
  "CSentry_ActionDefs",
  "eLinkSubscription",
  "eLinkAlias",
  "DBrowseAncestorsCore",
  "CSentry_Actions",
  "eLinkUnhandledEvent",
  "eLinkMessages",
  "CSentry_Schedule",
  "eLinkMessageLog",
  "DBrowseAncestors",
  "SOVControlRules",
  "CSentry_Lock",
  "SOVMgmtMsgs",
  "LLComments",
  "DVersExtraData",
  "Commmember",
  "CSentry_Limits",
  "DStagingImport",
  "CommMemberReq",
  "CSentry_ViolationDetails",
  "FileCache",
  "Commcalendar",
  "CSentry_EnabledLimits",
  "LLClassify",
  "DObjectRank",
  "CommcalendarRoles",
  "CSentry_LimitBreachBase",
  "rimsNodeClassification",
  "UserNickname",
  "CSentry_LimitBreachUser",
  "RM_CLASSIFICATION",
  "CommMetrics",
  "DTreeAncestors",
  "CSentry_Log",
  "RM_DISPOSITIONS",
  "CommIni",
  "RM_DISPRESULTS",
  "LLDirectory",
  "RM_PickList",
  "LLMultiVolumeRegistry",
  "RM_RecordsOfficers",
  "LLCommNotification",
  "RM_UserAudit",
  "LLCommRegistry",
  "RM_DeleteAudit",
  "LLQuestions",
  "RM_TempData",
  "LLForums",
  "RM_RecordsManagers",
  "LLForumsDirectory",
  "RM_MultiClass",
  "LLForumsOrder",
  "RM_AddRights",
  "RM_DocXRef",
  "repl_id_map",
  "RM_Functions",
  "RM_AssignedFunctions",
  "ACCESSION",
  "DocXRefTyp",
  "RelatType",
  "ThesRelations",
  "ThesTerms",
  "ThesHistory",
  "TermLevel",
  "DSubObjectRank",
  "ActionCode",
  "SearchACLView",
  "DateToUse",
  "DTreeNotifyRecover",
  "DISPOSITION"
];

var nameToTbl = _.keyBy(tableNames, function(v) {
  return v.toLowerCase();
});

var tblMap = _.keyBy(tableNames, function(v) {
  return v;
});

function search(modules, options) {
  "use strict";

  if (!_.isArray(modules)) {
    modules = [modules];
  }

  var modObjs = modules.map(function(modName) {
    return new Module(modName, options.base);
  });

  var params = {};

  return parseUtils
    .listScriptsInModules(modObjs)
    .then(function(allFiles) {
      return processFiles(allFiles, params);
    })
    .then(function(results) {
      /*
            var output = genCoverageData( results.blocks, results.functions, gen.getIDs(), params.sourceStore );
            fs.writeFileSync( options.output, JSON.stringify( output ), 'utf8' );

            // add headers
            modObjs.forEach( function( m ) {
                addHeader( m.getStartupScripts() );
            } );
            */
    })
    .catch(function(e) {
      console.error("There was a problem: ", e);
    });
}

function processFiles(srcFiles, params) {
  "use strict";
  return Q.nfcall(
    async.mapLimit,
    srcFiles,
    4,
    processEach.bind(null, params)
  ).then(combine);
}

function stringifyJSON(node) {
  var seen = [];
  return JSON.stringify(
    node,
    function(key, val) {
      if (["std", "loc", "range", "lbp", "scope", "led"].indexOf(key) >= 0) {
        return;
      }

      if (val != null && typeof val == "object") {
        if (seen.indexOf(val) >= 0) {
          return;
        }
        seen.push(val);
      }
      return val;
    },
    4
  );
}

var globalVar = {
  value: "$",
  arity: "unary",
  argument: {
    arity: "literal",
    decl: false
  },
  type: "UnaryExpression",
  operator: "$",
  prefix: true
};

var singleVar = {
  arity: "name",
  decl: true
};

var anyPrgCtx = {
  value: ".",
  arity: "binary",
  object: {
    value: ".",
    arity: "binary",
    object: {},
    property: {
      value: "fDBConnect",
      arity: "literal"
    },
    type: "MemberExpression"
  },
  property: {
    value: "fConnection",
    arity: "literal"
  },
  type: "MemberExpression"
};

var anyDbConnect = {
  object: {
    arity: "name"
  },
  property: {
    value: "fConnection",
    arity: "literal"
  },
  type: "MemberExpression"
};

var dtTable = {
  value: "$",
  arity: "unary",
  argument: {
    value: "DT_TABLE",
    arity: "literal"
  },
  type: "UnaryExpression",
  operator: "$",
  prefix: true
};

function getStaticStr(node) {
  if (node.arity === "literal" && typeof node.value === "string") {
    return node.value;
  }

  if (cmp(node, dtTable)) {
    // We don't use this format, but it's valid SQL to parse, so this
    // will be our hint that we need to replace it with $DT_TABLE
    return "[DTree]";
  }

  if (node.type === "BinaryExpression" && node.operator === "+") {
    var left = getStaticStr(node.left);
    var right = getStaticStr(node.right);

    if (left === null || right === null) {
      return null;
    }

    return left + right;
  }

  return null;
}

var execSQL = {
  callee: [
    {
      type: "MemberExpression",
      property: {
        value: "ExecSQL"
      }
    }
  ]
};

var varInit = {
  type: "VariableDeclarator",
  init: {
    value: "select * from dtree",
    arity: "literal"
  },
  dataType: {
    value: "String",
    arity: "name"
  }
};

var assignment = {
  arity: "binary",
  left: {
    arity: "name"
  },
  right: {
    arity: "literal"
  },
  type: "AssignmentExpression",
  operator: "="
};

var countNotStatic = 0,
  countStatic = 0;

var commonStatements = {};

function processEach(params, file, done) {
  // console.log( "Reading file: ", file );

  parseUtils
    .parseFile(file)
    .then(function(parseResult) {
      // save the original source code.
      var src = parseResult.src;

      src = `function Test(prgCtx); String s = "select * from dtree"; s = "select * from dtree"; .execsql( prgCtx, s ); end;`;

      var parser = Bannockburn.Parser(),
        ast = parser.parse(src),
        astNode = parseUtils.getASTNode;

      // console.log(stringifyJSON(ast));

      var w = new Bannockburn.Walker();

      var curScript = path.basename(file).replace(/\.Script$/, "");
      var curFunction = "";

      var editList = new EditList(src);

      var emitDecl = false;

      w.on("VariableDeclarator", function(node) {
        console.log("Declaration: ", stringifyJSON(node));
      });

      w.on("AssignmentExpression", function(node) {
        console.log("Assignment: ", stringifyJSON(node));
      });

      w.on("FunctionDeclaration", function(node) {
        curFunction = node.name;
        emitDecl = false;
      });

      w.on("CallExpression", function(node) {
        var nodeCode = src.substring(node.range[0], node.range[1] + 1);

        if (cmp(node, execSQL)) {
          var arg = node.arguments[1];
          var argCode = src.substring(arg.range[0], arg.range[1] + 1);
          var staticVal = getStaticStr(arg);

          if (staticVal !== null) {
            countStatic++;
            console.log("Static: ", staticVal);

            var stmt = staticVal.toLowerCase();

            if (!commonStatements[stmt]) {
              commonStatements[stmt] = 1;
            } else {
              commonStatements[stmt]++;
            }
          } else {
            if (!emitDecl) {
              console.log(
                "__________________________________________________________"
              );
              console.log(file, " : ", curFunction);
              console.log("==>");
              emitDecl = true;
            }

            countNotStatic++;
            console.log(" => Statement: ", nodeCode);
            console.log(" => Fix: ", argCode);

            console.log(stringifyJSON(arg));
          }
        }
      });

      w.start(ast);

      process.exit(0);

      // instrument the code.
      // var result = instrument( parseResult.src, parseResult.ast, blockIDGen, params );

      // write the modified code back to the original file.
      // fs.writeFileSync( file, result.result, 'utf8' );

      // just return the block & function data.
      done(null, { result: [] });
    })
    .catch(function(e) {
      // don't kill the whole process.
      console.error("Problem instrumenting file. ", e, " in file: ", file);
      done(null, { results: [] });
    })
    .done();
}

var x = 0;

function combine(results) {
  console.log("Non-Static SQL statements: ", countNotStatic);
  console.log("Static SQL statements: ", countStatic);

  var commonList = [];

  _.forEach(commonStatements, function(v, k) {
    if (v > 1) {
      commonList.push({ stmt: k, val: v });
    }
  });

  console.log("=============================================================");
  console.log("Common Statements: ");
  console.log("=============================================================");

  commonList
    .sort((a, b) => {
      return a.val - b.val;
    })
    .forEach(v => {
      console.log("Statement [" + v.val + "]: " + v.stmt);
    });

  return results.reduce(
    function(last, cur) {
      return {
        results: last.results.concat(cur.results)
      };
    },
    {
      results: []
    }
  );
}

module.exports = search;
