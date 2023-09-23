function isSimpleOp(node) {
  if (!node) {
    return true;
  }
  var arg = node[0];

  if (
    arg.id === "(name)" ||
    arg.id === "(literal)" ||
    arg.arity === "literal"
  ) {
    return true;
  } else if (arg.type === "MemberExpression") {
    return (
      (!arg.object ||
        arg.object.id === "(name)" ||
        arg.object.id === "(literal)" ||
        arg.object.arity === "literal") &&
      arg.property &&
      (arg.property.id === "(name)" ||
        arg.property.id === "(literal)" ||
        arg.property.arity === "literal")
    );
  }
  return false;
}

module.exports = { isSimpleOp };
