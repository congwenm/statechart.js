(function() {
  "use strict";

  var slice = Array.prototype.slice;

  // Internal: Returns a boolean indicating whether the given object is an
  // Array.
  function isArray(o) {
    return Object.prototype.toString.call(o) === '[object Array]';
  }

  // Internal: Flattens the given array by removing all nesting.
  function flatten(array) {
    var result = [], i, n;

    for (i = 0, n = array.length; i < n; i++) {
      // recursively loop through contents of array to push all non array atoms onto results
      if (isArray(array[i])) {
        result = result.concat(flatten(array[i]));
      }
      else {
        result.push(array[i]);
      }
    }

    return result;
  }

  // Internal: Returns an array containing the unique states in the given array.
  function uniqStates(states) {
    var seen = {}, a = [], path, i, n;

    // loop through states
    for (i = 0, n = states.length; i < n; i++) {
      // if state is falsy, skip
      if (!states[i]) { continue; }
      path = states[i].path();

      // main: if path was not seen, state's path has now been seen, seen.assign({path: true})
      // push state to the result []
      if (!seen[path]) {
        a.push(states[i]);
        seen[path] = true;
      }
    }

    return a;
  }

  // Internal: Calculates and caches the path from the root state to the
  // receiver state. Subsequent calls will return the cached path array.
  //
  // Returns an array of `State` objects.
  function _path() {
    // use recusion on the this.superstate to return a state heirarchy
    // [rootState].concat(alphaState).concat(betaState).concat(omegaState)
    return this.__cache__._path = this.__cache__._path ||
      (this.superstate ? _path.call(this.superstate).concat(this) : [this]);
  }

  // Internal: Returns an array of all current leaf states.
  function _current() {
    var a = [], i, n;

    if (!this.__isCurrent__) { return []; } //returns [] if this state is not active
    if (this.substates.length === 0) { return [this]; } // if this state has no substate and isActive, return this state

    // loops through substates, and recursively check if any substate is active
    // if so, resursively check if that substate have an active substate and return the deepest nested active substate
    for (i = 0, n = this.substates.length; i < n; i++) {
      if (this.substates[i].__isCurrent__) {
        a = a.concat(_current.call(this.substates[i]));
      }
    }

    return a;
  }

  // Internal: Finds the pivot state between the receiver and the given state.
  // The pivot state is the first common ancestor between the two states.
  //
  // Returns a `State` object.
  // Throws `Error` if the two states do not belong to the same statechart.
  function findPivot(other) {
    var p1 = _path.call(this), p2 = _path.call(other), i, len, p;

    // loop from i = 0 to min(p1.length, p2.length)
    // find common paths from the root of the two path and terminate loop when mismatch occurs
    // e.g.
    // 1: [root, state1, state2, state3, state4]
    // 2: [root, state1, state2, state5]
    // mismatch at [3], break and return {p} = {state2}
    for (i = 0, len = p1.length < p2.length ? p1.length : p2.length; i < len; i++) {
      if (p1[i] === p2[i]) { p = p1[i]; } else { break; }
    }

    if (!p) {
      throw new Error('State#findPivot: states ' + this + ' and ' + other + ' do not belong to the same statechart');
    }

    return p;
  }

  // Internal: Queues up a transition for later processing. Transitions are
  // queued instead of happening immediately because we need to allow all
  // current states to receive an event before any transitions actually occur.
  //
  // pivot  - The pivot state between the start state and destination states.
  // states - An array of destination states.
  // opts   - The options object passed to the `goto` method.
  //
  // Returns nothing.
  function queueTransition(pivot, states, opts) {
    this.__transitions__.push(
      {pivot: pivot, states: states, opts: opts});
  }

  // Internal: Performs all queued transitions. This is the method that actually
  // takes the statechart from one set of current states to another.
  function transition() {
    // flushes out all transitions queued up with .enter()
    var ts = this.__transitions__, i, len;

    if (!ts || ts.length === 0) { return; }

    for (i = 0, len = ts.length; i < len; i++) {
      enter.call(ts[i].pivot, ts[i].states, ts[i].opts);
    }

    this.__transitions__ = [];
  }

  // Internal: Invokes all registered enter handlers.
  function callEnterHandlers(context) {
    var i, n;
    for (i = 0, n = this.enters.length; i < n; i++) {
      this.enters[i].call(this, context);
    }
  }

  // Internal: Invokes all registered exit handlers.
  function callExitHandlers(context) {
    var i, n;
    for (i = 0, n = this.exits.length; i < n; i++) {
      this.exits[i].call(this, context);
    }
  }

  // Internal: Enters a clustered state. Entering a clustered state involves
  // exiting the current substate (if one exists and is not a destination
  // state), invoking the `enter` callbacks on the receiver state, and
  // recursively entering the new destination substate. The new destination
  // substate is determined as follows:
  //
  // 1. the substate indicated in the `states` argument if its not empty
  // 2. the result of invoking the condition function defined with the `C`
  //    method if it exists and returns a substate path
  // 3. the most recently exited substate if the state was defined with the
  //    `H` option and has been previously entered
  // 4. the first substate
  //
  // states - An array of destination states (may be empty to indicate that
  //          a condition, history, or default substate should be entered).
  // opts   - The options passed to `goto`.
  //
  // Returns the receiver.
  // Throws an `Error` if the given destination states include multiple
  //   substates.
  function enterClustered(states, opts) {
    // selflen = length of current path segment???
    // dir/subdir/file,
    var selflen = _path.call(this).length,
        nexts   = [],
        state, paths, cur, next, i, n;

    // find the first active substate and set to {cur}, break out of for loop
    for (i = 0, n = this.substates.length; i < n; i++) {
      if (this.substates[i].__isCurrent__) { cur = this.substates[i]; break; }
    }

    // for each of the entereClustered states, push the ? current level of depth of path_array of the substate.
    // e.g. this = /root/first
    // and substates = [/root/second/send],
    // then nexts = [second / send (not sure which)]
    for (i = 0, n = states.length; i < n; i++) {
      nexts.push(_path.call(states[i])[selflen]);
    }

    // throws error, if [nexts] has multiple states
    if (uniqStates(nexts).length > 1) {
      throw new Error("State#enterClustered: attempted to enter multiple substates of " + this + ": " + nexts.join(', '));
    }

    // if there is no nexts but there are substates in this,
    // determine next state priority 1. Condition, 2. History, 3. First Substate
    if (!(next = nexts[0]) && this.substates.length > 0) {

      // if a this.C (condition state function) is defined and
      // calling it gets truthy paths, flatten those paths
      // e.g. result: [./d, ./b, ./c]
      if (this.__condition__ && (paths = this.__condition__.call(this, opts.context))) {
        paths  = flatten([paths]);
        states = [];

        // for all [paths], check if path is resolvable
        // (from this),
        // if not, throw error, else push into states[]
        for (i = 0, n = paths.length; i < n; i++) {
          if (!(state = this.resolve(paths[i]))) {
            throw new Error("State#enterClustered: could not resolve path '" + paths[i] + "' returned by condition function from " + this);
          }
          states.push(state);
        }
        // calls this.enterClustered(states, opts) recursively with // the valid states
        return enterClustered.call(this, states, opts);
      }

      // else if history exist for this state, set {next} to {previous} page, basically going back.??
      if (this.history) { next = this.__previous__; }

      // else set next to first substate;
      if (!next) { next = this.substates[0]; }
    }

    // if {cur} isn't {next} which defined in the first for loop, call exit on {cur}, cur.exit(opts)
    if (cur && cur !== next) { exit.call(cur, opts); }

    // if (state is not currently active state) || option has (force: true),
    // record information through trace and set current active
    // state to {true}, call #callEnterHandler()
    if (!this.__isCurrent__ || opts.force) {
      trace.call(this, "State: [ENTER]  : " + this.path() + (this.__isCurrent__ ? ' (forced)' : ''));
      this.__isCurrent__ = true;
      callEnterHandlers.call(this, opts.context);
    }

    // if theres a next as this point (which is likely), enters the receiver state
    // with next.enter(states, opts);
    if (next) { enter.call(next, states, opts); }

    // return current state instance for chainable???
    return this;
  }

  // Internal: Enters a concurrent state. Entering a concurrent state simply
  // involves calling the `enter` method on the receiver and recursively
  // entering each substate.
  //
  // states - An array of destination states.
  // opts   - The options passed to `goto`.
  //
  // Returns the receiver.
  function enterConcurrent(states, opts) {
    var sstate, dstates, i, j, ni, nj;

    // if this isn't already active or if we are force entering
    // enter by setting {__isCurrent__} to true
    // call enterHandler
    if (!this.__isCurrent__ || opts.force) {
      trace.call(this, "State: [ENTER]  : " + this.path() + (this.__isCurrent__ ? ' (forced)' : ''));
      this.__isCurrent__ = true;
      callEnterHandlers.call(this, opts.context);
    }

    // loop over all substate of this
    for (i = 0, ni = this.substates.length; i < ni; i++) {
      sstate  = this.substates[i];
      dstates = [];

      // internally nest a loop to loopover the params[:states]
      // check if substate(:sstate) and targeted params[:state] pivots at substate
      // (basically checking if targeted state is stemmed from this substate)
      // then adds the targeted params[:state] to destination_states[]
      for (j = 0, nj = states.length; j < nj; j++) {
        if (findPivot.call(sstate, states[j]) === sstate) {
          dstates.push(states[j]);
        }

      }

      // call sstate.enter(dstates, opts), substate will enter into all desintation states
      enter.call(sstate, dstates, opts);
    }

    return this;
  }

  // Internal: Enters the receiver state. The actual entering logic is in the
  // `enterClustered` and `enterConcurrent` methods.
  //
  // states - An array of destination states.
  // opts   - The options passed to `goto`.
  //
  // Returns the receiver.
  function enter(states, opts) {
    return this.concurrent ?
      enterConcurrent.call(this, states, opts) :
      enterClustered.call(this, states, opts);
  }

  // Internal: Exits a clustered state. Exiting happens bottom to top, so we
  // recursively exit the current substate and then invoke the `exit` method on
  // each state as the stack unwinds.
  //
  // opts - The options passed to `goto`.
  //
  // Returns the receiver.
  function exitClustered(opts) {
    var cur, i, n;

    // loop through #substates, and check if any are active,
    // set to {cur} and break on first one found
    for (i = 0, n = this.substates.length; i < n; i++) {
      if (this.substates[i].__isCurrent__) { cur = this.substates[i]; break; }
    }

    // if this.history for current state is set to true,
    // set current state's .__previous__ to active substate
    // NOTE: {cur} can potentially be undefined
    if (this.history) { this.__previous__ = cur; }

    // calls exit from {cur} state
    if (cur) { exit.call(cur, opts); }

    // invoke exit handlers, deactivate current state
    callExitHandlers.call(this, opts.context);
    this.__isCurrent__ = false;
    trace.call(this, "State: [EXIT]   : " + this.path());

    return this;
  }

  // Internal: Exits a concurrent state. Similiar to `exitClustered` we
  // recursively exit each substate and invoke the `exit` method as the stack
  // unwinds.
  //
  // opts - The options passed to `goto`.
  //
  // Returns the receiver.
  function exitConcurrent(opts) {
    var root = this.root(), i, n;

    // loop through substates and calls exit() on all substates with the same {opts}
    for (i = 0, n = this.substates.length; i < n; i++) {
      exit.call(this.substates[i], opts);
    }

    callExitHandlers.call(this, opts.context);
    this.__isCurrent__ = false;
    if (this !== root) { trace.call(this, "State: [EXIT]   : " + this.path()); }

    return this;
  }

  // Internal: Exits the receiver state. The actual exiting logic is in the
  // `exitClustered` and `exitConcurrent` methods.
  //
  // opts   - The options passed to `goto`.
  //
  // Returns the receiver.
  function exit(opts) {
    return this.concurrent ?
      exitConcurrent.call(this, opts) : exitClustered.call(this, opts);
  }

  // Internal: Asks the receiver state if it can exit.
  //
  // destStates - The destination states.
  // opts       - The options passed to `goto`.
  //
  // Returns boolean.
  function canExit(destStates, opts) {
    var i, n;
    // loop through substates,
    // if substate is active then recursively call canExit() on that substates's
    // substates with the current args (destStates, opts) passed in
    // to make sure that all substates are exitable (canExit() === true)
    for (i = 0, n = this.substates.length; i < n; i++) {
      if (this.substates[i].__isCurrent__) {
        if (canExit.call(this.substates[i], destStates, opts) === false) {
          return false;
        }
      }
    }

    // returns current state's #canExit call () which is prototype defaulted to {true}
    return this.canExit(destStates, opts);
  }

  // Internal: Sends an event to a clustered state.
  //
  // Returns a boolean indicating whether or not the event was handled by the
  //   current substate.
  function sendClustered() {
    var handled = false, i, n, cur;

    // loop through @substates
    // set first active one to {cur}, done
    for (i = 0, n = this.substates.length; i < n; i++) {
      if (this.substates[i].__isCurrent__) { cur = this.substates[i]; break; }
    }

    // if there is active substates basically,
    // call active substate.send(...arguments)
    if (cur) { handled = !!cur.send.apply(cur, slice.call(arguments)); }

    return handled;
  }

  // Internal: Sends an event to a concurrent state.
  //
  // Returns a boolean indicating whether or not the event was handled by all
  //   substates.
  function sendConcurrent() {
    var args = slice.call(arguments), handled = true, state, i, n;

    // loop through substates
    // send to all substates, substate.send(...arguments)
    // {handled} is only true if all send calls returned true.
    for (i = 0, n = this.substates.length; i < n; i++) {
      state   = this.substates[i];
      handled = state.send.apply(state, args) && handled;
    }

    return handled;
  }

  // Internal: Logs the given message. How the message gets logged is determined
  // by the `State.logger` property. By default this is `console`, but can be
  // setto use another logger object. It assumes that there is an `info` method
  // on the logger object.
  function trace(message) {
    var logger = State.logger || console;
    if (!this.root().trace || !logger) { return; }
    logger.info(message);
  }

  // Public: The `State` constructor.
  //
  // name - A string containing the name of the state.
  // opts - An object containing zero or more of the following keys (default:
  //        `null`).
  //        concurrent - Makes the state's substates concurrent.
  //        H          - Causes the state to keep track of its history state.
  //                     Set to `true` to track just the history of this state
  //                     or `'*'` to track the history of all substates.
  // f    - A function to invoke in the context of the newly created state
  //        (default: `null`).
  //
  // Returns nothing.
  // Throws `Error` if both the `concurrent` and `H` options are set.
  function State(name, opts, f) {

    // jQuery style "smart" arguments recognizer
    if (typeof opts === 'function') {
      f    = opts;
      opts = {};
    }

    opts = opts || {};

    // can't be both 'concurrent' and 'History'
    if (opts.concurrent && opts.H) {
      throw new Error('State: history states are not allowed on concurrent states');
    }

    this.name            = name;
    this.substateMap     = {};
    this.substates       = [];
    this.superstate      = null;
    this.enters          = [];
    this.exits           = [];
    this.events          = {};
    this.concurrent      = !!opts.concurrent;
    this.history         = !!(opts.H);
    this.deep            = opts.H === '*';
    this.__isCurrent__   = false;
    this.__cache__       = {};
    this.__transitions__ = [];
    this.trace           = false;

    // post constructor invoke in the context of the new-born instance
    if (f) { f.call(this); }
  }

  // Public: Convenience method for creating a new statechart. Simply creates a
  // root state and invokes the given function in the context of that state.
  //
  // opts - An object of options to pass the to the `State` constructor
  //        (default: `null`).
  // f    - A function object to invoke in the context of the newly created root
  //        state (default: `null`).
  //
  // Examples
  //
  //   var sc = State.define({concurrent: true}, function() {
  //     this.state('a');
  //     this.state('b');
  //     this.state('c');
  //   });
  //
  // Returns the newly created root state.
  State.define = function() {
    var opts = {}, f = null, s;

    // 'smart' arguments recognizer
    if (arguments.length === 2) {
      opts = arguments[0];
      f    = arguments[1];
    }
    else if (arguments.length === 1) {
      if (typeof arguments[0] === 'function') {
        f = arguments[0];
      }
      else {
        opts = arguments[0];
      }
    }
    // basically same as calling `new State('__root__', opts, f)`
    s = new this('__root__', opts, f);
    return s;
  };

  // Public: Indicates whether the state is the root of the statechart created
  // by the `State.define` method.
  State.prototype.isRoot = function() { return this.name === '__root__'; };

  // Public: Creates a substate with the given name and adds it as a substate to
  // the receiver state. If a `State` object is given, then it simply adds the
  // state as a substate. This allows you to split up the definition of your
  // states instead of defining everything in one place.
  //
  // name - A string containing the name of the state or a `State` object.
  // opts - An object of options to pass to the `State` constructor
  //        (default: `null`).
  // f    - A function to invoke in the context of the newly created state
  //        (default: `null`).
  //
  // Examples
  //
  //   var s2 = new State('s2');
  //   s2.state('s21');
  //   s2.state('s22');
  //
  //   var sc = State.define(function() {
  //     this.state('s', function() {
  //       this.state('s1', function() {
  //         this.state('s11');
  //         this.state('s12');
  //       });
  //
  //       this.state(s2);
  //     });
  //   });
  //
  // Returns the newly created state.
  State.prototype.state = function(name, opts, f) {
    var s = name instanceof this.constructor ? name :
      new this.constructor(name, opts, f);
    this.addSubstate(s);
    return s;
  };

  // Public: Registers an enter handler to be called with the receiver state
  // is entered. The `context` option passed to `goto` will be passed to the
  // given function when invoked.
  //
  // Multiple enter handlers may be registered per state. They are invoked in
  // the order in which they are defined.
  //
  // f - A function to call when the state is entered.
  //
  // Returns the receiver.
  State.prototype.enter = function pState_enter(f) { this.enters.push(f); return this; };

  // Public: Registers an exit handler to be called with the receiver state
  // is exited. The `context` option passed to `goto` will be passed to the
  // given function when invoked.
  //
  // Multiple exit handlers may be registered per state. They are invoked in
  // the order in which they are defined.
  //
  // f - A function to call when the state is exited.
  //
  // Returns the receiver.
  State.prototype.exit = function pState_exit(f) { this.exits.push(f); return this; };

  // Public: A function that can be used to prevent a state from being exited.
  // `destStates` and `context` are the destination states and context that
  // will be transitioned to if the states can be exited.
  //
  // destStates - The destination states.
  // context    - The destination context.
  //
  // Returns the receiver.
  State.prototype.canExit = function(/*destStates, context*/) { return true; };

  // Public: Registers an event handler to be called when an event with a
  // matching name is sent to the state via the `send` method.
  //
  // Only one event handler may be registered per event.
  //
  // name - The name of the event.
  // f    - A function to call when the event occurs.
  //
  // Returns the receiver.
  State.prototype.event = function pState_event(name, f) { this.events[name] = f; return this; };

  // Public: Defines a condition state on the receiver state. Condition states
  // are consulted when entering a clustered state without specified destination
  // states. The given function should return a path to some substate of the
  // state that the condition state is defined on.
  //
  // f - The condition function.
  //
  // Examples
  //
  //   var sc = State.define(function() {
  //     this.state('a', function() {
  //       this.C(function() {
  //         if (shouldGoToB) { return './b'; }
  //         if (shouldGoToC) { return './c'; }
  //         if (shouldGoToD) { return './d'; }
  //       });
  //       this.state('b');
  //       this.state('c');
  //       this.state('d');
  //     });
  //   });
  //
  // Returns nothing.
  State.prototype.C = function pState_C(f) {
    if (this.concurrent) {
      throw new Error('State#C: a concurrent state may not have a condition state: ' + this);
    }

    this.__condition__ = f;
  };

  // Public: Returns an array of paths to all current leaf states.
  State.prototype.current = function pState_current() {
    var states = _current.call(this), paths = [], i, n;

    // getting each states' path?.. why not map iterate? performance reasons?
    for (i = 0, n = states.length; i < n; i++) {
      paths.push(states[i].path());
    }

    return paths;
  };

  // Public: The `State` iterator - invokes the given function once for each
  // state in the statechart. The states are traversed in a preorder depth-first
  // manner.
  //
  // f - A function object, it will be invoked once for each state.
  //
  // Returns the receiver.
  State.prototype.each = function pState_each(f) {
    var i, n;

    f(this);
    // iterate all substate and their substates' substate's etc..
    for (i = 0, n = this.substates.length; i < n; i++) {
      this.substates[i].each(f);
    }

    // chainable
    return this;
  };

  // Public: Adds the given state as a substate of the receiver state.
  //
  // Returns the receiver.
  State.prototype.addSubstate = function pState_addSubstate(state) {
    var deep = this.deep, didAttach = this.root().isRoot();
    // add {state} to {{substatesMap}} and [substates]
    this.substateMap[state.name] = state;
    this.substates.push(state);

    // set its .superstate to {this}
    state.superstate = this;

    // loop through all its nested states
    // clearing __cache__, which is just {_path} of states
    // if this is deep, then set {deep} and {history} on all substates to {true}
    // if this is attached (its root has name '__root__'), invoke substate#didAttach, which is an empty function used by 'RoutableState'
    state.each(function(s) {
      s.__cache__ = {};
      if (deep) { s.history = s.deep = true; }
      if (didAttach) { s.didAttach(); }
    });
    return this;
  };

  // Internal: Invoked by the `#addSubstate` method when the state has been
  // connected to a root statechart. This is currently only used by the
  // `RoutableState` substate and should not be invoked by client code.
  State.prototype.didAttach = function pState_didAttach() {};

  // Public: Indicates whether the receiver state is attached to a root statechart node.
  // Basically checks if root is named '__root__'
  State.prototype.isAttached = function pState_isAttached() { return this.root().isRoot(); };

  // Public: Returns the root state.
  // Recursively
  State.prototype.root = function pState_root() {
    // recursively find the root of this state by looking up superstate#root
    return this.__cache__.root = this.__cache__.root ||
      (this.superstate ? this.superstate.root() : this);
  };

  // Public: Returns a string containing the full path from the root state to
  // the receiver state. State paths are very similar to unix directory paths.
  //
  // Examples
  //
  //   var r = new State('root'),
  //       a = new State('a'),
  //       b = new State('b'),
  //       c = new State('c');
  //
  //   r.addSubstate(a);
  //   a.addSubstate(b);
  //   b.addSubstate(c);
  //
  //   r.path(); // => "/"
  //   a.path(); // => "/a"
  //   b.path(); // => "/a/b"
  //   c.path(); // => "/a/b/c"
  State.prototype.path = function pState_path() {
    // get an array of states leading up to this [stateRoot, state1, state2]
    var states = _path.call(this), names = [], i, len;

    // iterate name and join with '/'
    for (i = 1, len = states.length; i < len; i++) {
      names.push(states[i].name);
    }

    return '/' + names.join('/');
  };

  // Public: Sets up a transition from the receiver state to the given
  // destination states. Transitions are usually triggered during event
  // handlers called by the `send` method. This method should be called on the
  // root state to send the statechart into its initial set of current states.
  //
  // paths - Zero or more strings representing destination state paths (default:
  //         `[]`).
  // opts  - An object containing zero or more of the following keys:
  //         context - An object to pass along to the `exit` and `enter` methods
  //                   invoked during the actual transistion.
  //         force   - Forces `enter` methods to be called during the transition
  //                   on states that are already current.
  //
  // Examples
  //
  //   var sc = State.define(function() {
  //     this.state('a', function() {
  //       this.state('b', function() {
  //         this.foo = function() { this.goto('../c'); };
  //       });
  //       this.state('c', function() {
  //         this.bar = function() { this.goto('../b'); };
  //       });
  //     });
  //   });
  //
  //   sc.goto();
  //   sc.current();   // => ['/a/b']
  //   sc.send('foo');
  //   sc.current();   // => ['/a/c']
  //   sc.send('bar');
  //   sc.current();   // => ['/a/b']
  //
  // Returns boolean. `false` if transition failed.
  // Throws an `Error` if called on a non-current non-root state.
  // Throws an `Error` if multiple pivot states are found between the receiver
  //   and destination states.
  // Throws an `Error` if a destination path is not reachable from the receiver.
  State.prototype.goto = function pState_goto() {
    var root   = this.root(),
        paths  = flatten(slice.call(arguments)),
        // checks if last argument is object and abduct it as opts
        opts   = typeof paths[paths.length - 1] === 'object' ? paths.pop() : {},
        states = [],
        pivots = [],
        state, pivot, i, n;

    // loop through [paths] called from goto: perfectly fine to call
    // word.goto(['./bold/off', '/underline/on']) if '/bold' and 'underline' are all current
    // all paths must be resolveable
    for (i = 0, n = paths.length; i < n; i++) {
      if (!(state = this.resolve(paths[i]))) {
        throw new Error('State#goto: could not resolve path ' + paths[i] + ' from ' + this);
      }

      states.push(state);
    }

    // loop through all states added
    // find pivots of current state(root?) and target state
    // push to [pivots]
    for (i = 0, n = states.length; i < n; i++) {
      pivots.push(findPivot.call(this, states[i]));
    }

    // there should only be 1 uniq state in [pivots]
    if (uniqStates(pivots).length > 1) {
      throw new Error("State#goto: multiple pivot states found between state " + this + " and paths " + paths.join(', '));
    }

    // set pivot to either pivots.first or current state
    pivot = pivots[0] || this;


    // basically invoke the canExit on all substates to determine if exit is allowed
    if (canExit.call(pivot, states, opts) === false){
      trace.call(this, 'State: [GOTO]   : ' + this + ' can not exit]');
      return false;
    }

    trace.call(this, 'State: [GOTO]   : ' + this + ' -> [' + states.join(', ') + ']');

    //if current state, invoking #goto isn't active and is attached to the state tree
    // throw error
    if (!this.__isCurrent__ && this.superstate) {
      throw new Error('State#goto: state ' + this + ' is not current');
    }

    // if the pivot state is a concurrent state and is not also the starting
    // state, then we're attempting to cross a concurrency boundary, which is
    // not allowed
    if (pivot.concurrent && pivot !== this) {
      throw new Error('State#goto: one or more of the given paths are not reachable from state ' + this + ': ' +  paths.join(', '));
    }

    // push transition to a queue {root.__transitions__}
    queueTransition.call(root, pivot, states, opts);

    // flushes out all transitions queued up in {root.__transitions__}
    if (!this.__isSending__) { transition.call(root); }

    return true;
  };

  // Public: Sends an event to the statechart. A statechart handles an event
  // by giving each current leaf state an opportunity to handle it. Events
  // bubble up superstate chains as long as handler methods do not return a
  // truthy value. When a handler does return a truthy value (indicating that
  // it has handled the event) the bubbling is canceled. A handler method is
  // registered with the `event` method.
  //
  // event   - A string containing the event name.
  // args... - Zero or more arguments that get passed on to the handler methods.
  //
  // Returns a boolean indicating whether or not the event was handled.
  // Throws `Error` if the state is not current.
  State.prototype.send = function pState_send() {
    var args = slice.call(arguments), events = this.events, handled;

    // PRE: can't send event to an inActive state
    if (!this.__isCurrent__) {
      throw new Error('State#send: attempted to send an event to a state that is not current: ' + this);
    }

    // if this is root, log with this msg
    if (this === this.root()) {
      trace.call(this, 'State: [EVENT]  : ' + args[0]);
    }

    // sends the event recursively and return a boolean
    // to signal if it got handled successfully
    handled = this.concurrent ? sendConcurrent.apply(this, arguments) :
      sendClustered.apply(this, arguments);

    // if NOT handled and current state registered a function with
    //    the same {name} or args[0],
    // hail mary shot by applying that event to {thisState} with remaining args,
    //    with the __isSending__ flag set to true so along the way any queued transition
    //    will be triggered.
    if (!handled && typeof events[args[0]] === 'function') {
      this.__isSending__ = true;
      handled = !!events[args[0]].apply(this, args.slice(1));
      this.__isSending__ = false;
    }

    // if this is a true root (no superstate), trigger transitions.
    if (!this.superstate) { transition.call(this); }

    return handled;
  };

  // Public: Resets the statechart by exiting all current states.
  State.prototype.reset = function pState_reset() { exit.call(this, {}); };

  // Public: Returns a boolean indicating whether or not the state at the given
  // path is current.
  //
  // Returns `true` or `false`.
  // Throws `Error` if the path cannot be resolved.
  State.prototype.isCurrent = function pState_isCurrent(path) {
    // check if {path} is resolvable from {thisState}
    var state = this.resolve(path);

    return !!(state && state.__isCurrent__);
  };

  // Public: Resolves a string path into an actual `State` object. Paths not
  // starting with a '/' are resolved relative to the receiver state, paths that
  // do start with a '/' are resolved relative to the root state.
  //
  // path      - A string containing the path to resolve or an array of path
  //             segments.
  // E.G. "/root/path1/path2"
  //
  // Returns the `State` object the path represents if it can be resolve and
  //   `null` otherwise.
  State.prototype.resolve = function pState_resolve(path) {
    var head, next;

    if (!path) { return null; }

    // convert path into array of string ['path1', 'path2', 'path3'], take first
    path      = typeof path === 'string' ? path.split('/') : path;
    head      = path.shift();

    switch (head) {
    case '': // startin with '/path1' will get ['', 'path1']
      next = this.root();
      break;
    case '.':
      next = this;
      break;
    case '..': // startin with '../path1' will get ['..', 'path1']
      next = this.superstate;
      break;
    default:
      next = this.substateMap[head];
    }

    if (!next) { return null; }

    // recursively use this method resolve() to call on next with ['path2', 'path3']
    //    until [path] becomes [], then return {next} (which would just be State 'path3')
    return path.length === 0 ? next : next.resolve(path);
  };

  // Public: Returns a formatted string with the state's full path.
  State.prototype.toString = function pState_toString() { return 'State(' + this.path() + ')'; };

  module.exports = State;
}());
