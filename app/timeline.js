function Intervals() {
  var toggles = [];
  this._initial = false;
  for (var i = 0; i < arguments.length; i +=2) {
    toggles.push(arguments[i]);
    toggles.push(arguments[i+1]);
  }
  this._toggles = toggles;
}
Intervals.prototype = {
  empty: function() {
    return (this._toggles.length === 0 && !this._initial);
  },

  ranges: function() {
    // TODO bork if initial is not false.
    var toggles = this._toggles;
    var ranges = [];
    for (var j=0; j < toggles.length; j += 2) {
      ranges.push({start: toggles[j], end: toggles[j+1]});
    }
    return ranges;
  },

  clip: function(start, end) {
    return this.intersection(new Intervals(start, end));
  },

  union: function(intervals) {
    return this._op(intervals, function(a, b) { return a || b; });
  },

  intersection: function(intervals) {
    return this._op(intervals, function(a, b) { return a && b; });
  },

  negation: function() {
    var r = new Intervals();
    r._toggles = this._toggles;
    r._initial = !this._initial;
    return r;
  },

  minus: function(intervals) {
    return this._op(intervals, function(a, b) { return a && !b; }); 
  },

  set: function(start, end) {
    return this.union(new Intervals(start, end));
  },

  clear: function(start, end) {
    return this.minus(new Intervals(start, end));
  },

  // implementation

  _op: function(other, op) {
    var s1 = this._initial, t1 = this._toggles, i1 = 0, len1 = t1.length;
    var s2 = other._initial, t2 = other._toggles, i2 = 0, len2 = t2.length;

    state = op(s1, s2);
    var r = new Intervals();
    r._initial = state;

    done:
    while (true) {
      var oldstate = state;
      var time;

      // this stanza is simply determining what state each intervals
      // is in, stepping through the toggles in both at once, in
      // order.  TODO once we've finished one array, can't we just
      // copy the other over?
      if (i1 >= len1) {
        if (i2 >= len2) {
          break done;
        }
        else {
          time = t2[i2]; s2 = !s2; i2++;
        }
      }
      else {
        if (i2 >= len2) {
          time = t1[i1]; s1 = !s1; i1++;
        }
        else if (t1[i1] < t2[i2]) {
          time = t1[i1]; s1 = !s1; i1++;
        }
        else if (t1[i1] > t2[i2]) {
          time = t2[i2]; s2 = !s2; i2++;
        }
        else {
          time = t1[i1]; s1 = !s1; s2 = !s2; i1++; i2++;
        }
      }

      state = op(s1, s2);
      if (oldstate != state) {
        r._toggles.push(time);
      }
    }
    return r;
  }
};

var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function Workbook() {
  var self = this;

  this.timelines = ko.observableArray();

  this.start = ko.observable(+new Date());
  // Number of milliseconds to a pixel
  this.grain = ko.observable(60 * 1000);
  this.end = ko.computed(function() {
    return self.start() + (640 * self.grain());
  }, self);

  this.dt = ko.computed(function() { return new Date(self.start()); });
  this.date = ko.computed(function() { return self.dt().getDate(); });
  this.month = ko.computed(function() { return MONTHS[self.dt().getMonth()]; });
  this.year = ko.computed(function() { return self.dt().getFullYear(); });

  this.date = ko.computed(function() {
    var dt = new Date(self.start());
    return dt.getDate() + ' ' + MONTHS[dt.getMonth()] + ' ' + dt.getFullYear();
  });

  this.addTimeline = function() {
    self.timelines.push(new Timeline(self));
  };

  this.timelineToScreen = function(start) {
    return (start - self.start()) / self.grain();
  };

  this.screenToTimeline = function(left) {
    return self.start() + (self.grain() * left);
  };

}

function Range(start, end, workbook) {
  var self = this;

  this.start = ko.observable(start);
  this.end = ko.observable(end);

  this.left = ko.computed(function() {
    return workbook.timelineToScreen(self.start());
  });
  this.width = ko.computed(function() {
    return workbook.timelineToScreen(self.end()) -
      workbook.timelineToScreen(self.start());
  });
}

function Timeline(workbook) {
  var self = this;

  this.workbook = workbook;

  this.name = ko.observable('idle');
  this.intervals = ko.observable(new Intervals());
  this.activeInterval = ko.observable(null);

  this.ranges = ko.computed(function() {
    var ranges = [];
    self.intervals()
      .clip(self.workbook.start(), self.workbook.end())
      .ranges()
      .forEach(function(r) {
        ranges.push(new Range(r.start, r.end, workbook));
      });
    return ranges;
  }, self);

  this.setInterval = function(start, end) {
    self.intervals(self.intervals().set(start, end));
  };

  this.clearInterval = function(start, end) {
    self.intervals(self.intervals().clear(start, end));
  };

  this.setActiveInterval = function() {
    self.setInterval(self.activeInterval().start(),
                     self.activeInterval().end());
    self.activeInterval(null);
  };

  this.screenToTimeline = function(left) {
    return self.workbook.screenToTimeline(left);
  };

};

// jqueryness

ko.bindingHandlers.timeline = {

  init: function(element, workbookAcc, _all, timeline) {
    var workbook = workbookAcc();
    $('.intervals', element).on('mousedown', function(event) {
      var pageX = event.pageX;
      var elemX = $(this).offset().left;
      var timeline = ko.dataFor(this);

      function eventPos(event) {
        return timeline.screenToTimeline(event.pageX - elemX);
      }

      var origPos = eventPos(event);
      var active = new Range(origPos, origPos, timeline.workbook);

      console.log({pageX: pageX, elemX: elemX, timeline: timeline, origPos: origPos});


      timeline.activeInterval(active);

      $(this).bind({
        'mouseup': function(event) {
          console.log({active: active, start: active.start(), end: active.end()});
          timeline.setActiveInterval();
          $(this).off('mouseup mousemove');
        },
        'mousemove': function(event) {
          var pos = eventPos(event);
          if (pos < origPos) {
            active.start(pos);
            active.end(origPos);
          }
          else {
            active.start(origPos);
            active.end(pos);
          }
        }
      });
    });
  }
};

$(document).load(function() {
});
