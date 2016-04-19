(function() {
  "use strict";

  var slice = Array.prototype.slice;

  exports.assign = function assign(target) {
    var sources = slice.call(arguments).slice(1), i, n, k;
    console.log('assigning');
    // for all sources
    for (i = 0, n = sources.length; i < n; i++) {
      // for each key in source s
      for (k in sources[i]) {
        // if value at source[key] is undefined or null or false, delete target[k]
        if (sources[i][k] === void 0 || sources[i][k] === null || sources[i][k] === false) {
          delete target[k];
        }

        // assign source value [at k] to target [at k]
        else {
          target[k] = sources[i][k];
        }
      }
    }

    return target;
  };


  exports.pick = function pick(o, keys) {
    // loop through all keys
    return keys.reduce(function(acc, k) {
      // pick out certain k-o[k] pairs to acc[] and return acc in the end
      acc[k] = o[k];
      return acc;
    }, {});
  };

}());
