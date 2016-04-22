let service = console.warn.bind(console); // replacable

let defaultOpts = {}

function tracker(context, consoleMsg, opts) {
  Object.assign({}, defaultOpts, opts);
  const {
    substates,
    name
  } = context;

  const mapIterator = (coll, func, context) {
    var results = {};
    for (var k in coll) {
      results[k] = func(k.call(context || null, coll[k], k));
    }
    return results;
  };

  // TODO: get a list of interesting status
  service({
    url: context.toString(),
    name,
    consoleMsg,
    timestamp: new Date(),
    substates: mapIterator(
      substateMap,
      (s,k) => s.toString()
    ),
    current: context.current(),
  });
}

module.exports = tracker;
