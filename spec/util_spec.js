(function() {
  var assign = require('../lib/util').assign;
  var pick = require('../lib/util').pick;

  // var assign = util.assign;
  // var pick = util.pick;

  describe("testing", function() {
    it('expect assign to work', function() {
      expect(assign({}, {a: 1}, {b:2})).toEqual({a: 1, b: 2});
    });
  });

  describe('pick', function() {
    it('expect pick to work', function() {
      expect(pick({a: 1, b: 2}, ['a'])).toEqual({a: 1});
    });
  });
}());
