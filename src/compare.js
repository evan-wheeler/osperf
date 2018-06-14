var pSlice = Array.prototype.slice,
  _ = require("lodash");

var partial_compare = (module.exports = function(fullObj, partialObj, opts) {
  if (!opts) opts = {};

  // For simple values, check full equal equivalence
  if (fullObj === partialObj) {
    return true;
  } else if (typeof fullObj === "string" && typeof partialObj === "string") {
    return fullObj.toLowerCase() === partialObj.toLowerCase();
  } else if (fullObj instanceof Date && partialObj instanceof Date) {
    return fullObj.getTime() === partialObj.getTime();
  } else if (typeof fullObj != "object" && typeof partialObj != "object") {
    // allow some flexibility in matching objects to other types.
    return opts.strict ? fullObj === partialObj : fullObj == partialObj;
  } else {
    //
    return checkObjParts(fullObj, partialObj, opts);
  }
});

function isNullish(v) {
  return v === null || v === undefined;
}

function checkObjParts(fullObj, partialObj, opts) {
  var i, key;

  var fNull = isNullish(fullObj),
    pNull = isNullish(partialObj);

  // allow two null-ish objects to compare positively, but not if only one is null/undefined.
  if (fNull && pNull) {
    return true;
  } else if (fNull || pNull) {
    return false;
  }

  // allow conversions from arguments to array.
  if (_.isArguments(fullObj)) {
    fullObj = pSlice.call(fullObj);
  }
  if (_.isArguments(partialObj)) {
    partialObj = pSlice.call(partialObj);
  }

  var kParts = _.keys(partialObj);

  // first check keys to make fullObj has all the same keys as partialObj
  i = kParts.length;
  while (i--) {
    key = kParts[i];
    if (typeof fullObj[key] === "undefined") {
      return false;
    }
  }

  // now check all values for every key in partialObj
  i = kParts.length;
  while (i--) {
    key = kParts[i];
    if (!partial_compare(fullObj[key], partialObj[key], opts)) {
      return false;
    }
  }

  return true;
}
