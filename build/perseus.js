/*! Perseus | http://github.com/Khan/perseus */
// commit 504752ea97ebdb0913012bfa3ac72846b69db0eb
// branch gh-pages
;(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*
Software License Agreement (BSD License)

Copyright (c) 2009-2011, Kevin Decker <kpdecker@gmail.com>

All rights reserved.

Redistribution and use of this software in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above
  copyright notice, this list of conditions and the
  following disclaimer.

* Redistributions in binary form must reproduce the above
  copyright notice, this list of conditions and the
  following disclaimer in the documentation and/or other
  materials provided with the distribution.

* Neither the name of Kevin Decker nor the names of its
  contributors may be used to endorse or promote products
  derived from this software without specific prior
  written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR
IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR
CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER
IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT
OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/

/*
 * Text diff implementation.
 *
 * This library supports the following APIS:
 * JsDiff.diffChars: Character by character diff
 * JsDiff.diffWords: Word (as defined by \b regex) diff which ignores whitespace
 * JsDiff.diffLines: Line based diff
 *
 * JsDiff.diffCss: Diff targeted at CSS content
 *
 * These methods are based on the implementation proposed in
 * "An O(ND) Difference Algorithm and its Variations" (Myers, 1986).
 * http://citeseerx.ist.psu.edu/viewdoc/summary?doi=10.1.1.4.6927
 */
var JsDiff = (function() {
  /*jshint maxparams: 5*/
  function clonePath(path) {
    return { newPos: path.newPos, components: path.components.slice(0) };
  }
  function removeEmpty(array) {
    var ret = [];
    for (var i = 0; i < array.length; i++) {
      if (array[i]) {
        ret.push(array[i]);
      }
    }
    return ret;
  }
  function escapeHTML(s) {
    var n = s;
    n = n.replace(/&/g, '&amp;');
    n = n.replace(/</g, '&lt;');
    n = n.replace(/>/g, '&gt;');
    n = n.replace(/"/g, '&quot;');

    return n;
  }

  var Diff = function(ignoreWhitespace) {
    this.ignoreWhitespace = ignoreWhitespace;
  };
  Diff.prototype = {
      diff: function(oldString, newString) {
        // Handle the identity case (this is due to unrolling editLength == 0
        if (newString === oldString) {
          return [{ value: newString }];
        }
        if (!newString) {
          return [{ value: oldString, removed: true }];
        }
        if (!oldString) {
          return [{ value: newString, added: true }];
        }

        newString = this.tokenize(newString);
        oldString = this.tokenize(oldString);

        var newLen = newString.length, oldLen = oldString.length;
        var maxEditLength = newLen + oldLen;
        var bestPath = [{ newPos: -1, components: [] }];

        // Seed editLength = 0
        var oldPos = this.extractCommon(bestPath[0], newString, oldString, 0);
        if (bestPath[0].newPos+1 >= newLen && oldPos+1 >= oldLen) {
          return bestPath[0].components;
        }

        for (var editLength = 1; editLength <= maxEditLength; editLength++) {
          for (var diagonalPath = -1*editLength; diagonalPath <= editLength; diagonalPath+=2) {
            var basePath;
            var addPath = bestPath[diagonalPath-1],
                removePath = bestPath[diagonalPath+1];
            oldPos = (removePath ? removePath.newPos : 0) - diagonalPath;
            if (addPath) {
              // No one else is going to attempt to use this value, clear it
              bestPath[diagonalPath-1] = undefined;
            }

            var canAdd = addPath && addPath.newPos+1 < newLen;
            var canRemove = removePath && 0 <= oldPos && oldPos < oldLen;
            if (!canAdd && !canRemove) {
              bestPath[diagonalPath] = undefined;
              continue;
            }

            // Select the diagonal that we want to branch from. We select the prior
            // path whose position in the new string is the farthest from the origin
            // and does not pass the bounds of the diff graph
            if (!canAdd || (canRemove && addPath.newPos < removePath.newPos)) {
              basePath = clonePath(removePath);
              this.pushComponent(basePath.components, oldString[oldPos], undefined, true);
            } else {
              basePath = clonePath(addPath);
              basePath.newPos++;
              this.pushComponent(basePath.components, newString[basePath.newPos], true, undefined);
            }

            var oldPos = this.extractCommon(basePath, newString, oldString, diagonalPath);

            if (basePath.newPos+1 >= newLen && oldPos+1 >= oldLen) {
              return basePath.components;
            } else {
              bestPath[diagonalPath] = basePath;
            }
          }
        }
      },

      pushComponent: function(components, value, added, removed) {
        var last = components[components.length-1];
        if (last && last.added === added && last.removed === removed) {
          // We need to clone here as the component clone operation is just
          // as shallow array clone
          components[components.length-1] =
            {value: this.join(last.value, value), added: added, removed: removed };
        } else {
          components.push({value: value, added: added, removed: removed });
        }
      },
      extractCommon: function(basePath, newString, oldString, diagonalPath) {
        var newLen = newString.length,
            oldLen = oldString.length,
            newPos = basePath.newPos,
            oldPos = newPos - diagonalPath;
        while (newPos+1 < newLen && oldPos+1 < oldLen && this.equals(newString[newPos+1], oldString[oldPos+1])) {
          newPos++;
          oldPos++;

          this.pushComponent(basePath.components, newString[newPos], undefined, undefined);
        }
        basePath.newPos = newPos;
        return oldPos;
      },

      equals: function(left, right) {
        var reWhitespace = /\S/;
        if (this.ignoreWhitespace && !reWhitespace.test(left) && !reWhitespace.test(right)) {
          return true;
        } else {
          return left === right;
        }
      },
      join: function(left, right) {
        return left + right;
      },
      tokenize: function(value) {
        return value;
      }
  };

  var CharDiff = new Diff();

  var WordDiff = new Diff(true);
  var WordWithSpaceDiff = new Diff();
  WordDiff.tokenize = WordWithSpaceDiff.tokenize = function(value) {
    return removeEmpty(value.split(/(\s+|\b)/));
  };

  var CssDiff = new Diff(true);
  CssDiff.tokenize = function(value) {
    return removeEmpty(value.split(/([{}:;,]|\s+)/));
  };

  var LineDiff = new Diff();
  LineDiff.tokenize = function(value) {
    var retLines = [],
        lines = value.split(/^/m);

    for(var i = 0; i < lines.length; i++) {
      var line = lines[i],
          lastLine = lines[i - 1];

      // Merge lines that may contain windows new lines
      if (line == '\n' && lastLine && lastLine[lastLine.length - 1] === '\r') {
        retLines[retLines.length - 1] += '\n';
      } else if (line) {
        retLines.push(line);
      }
    }

    return retLines;
  };

  return {
    Diff: Diff,

    diffChars: function(oldStr, newStr) { return CharDiff.diff(oldStr, newStr); },
    diffWords: function(oldStr, newStr) { return WordDiff.diff(oldStr, newStr); },
    diffWordsWithSpace: function(oldStr, newStr) { return WordWithSpaceDiff.diff(oldStr, newStr); },
    diffLines: function(oldStr, newStr) { return LineDiff.diff(oldStr, newStr); },

    diffCss: function(oldStr, newStr) { return CssDiff.diff(oldStr, newStr); },

    createPatch: function(fileName, oldStr, newStr, oldHeader, newHeader) {
      var ret = [];

      ret.push('Index: ' + fileName);
      ret.push('===================================================================');
      ret.push('--- ' + fileName + (typeof oldHeader === 'undefined' ? '' : '\t' + oldHeader));
      ret.push('+++ ' + fileName + (typeof newHeader === 'undefined' ? '' : '\t' + newHeader));

      var diff = LineDiff.diff(oldStr, newStr);
      if (!diff[diff.length-1].value) {
        diff.pop();   // Remove trailing newline add
      }
      diff.push({value: '', lines: []});   // Append an empty value to make cleanup easier

      function contextLines(lines) {
        return lines.map(function(entry) { return ' ' + entry; });
      }
      function eofNL(curRange, i, current) {
        var last = diff[diff.length-2],
            isLast = i === diff.length-2,
            isLastOfType = i === diff.length-3 && (current.added !== last.added || current.removed !== last.removed);

        // Figure out if this is the last line for the given file and missing NL
        if (!/\n$/.test(current.value) && (isLast || isLastOfType)) {
          curRange.push('\\ No newline at end of file');
        }
      }

      var oldRangeStart = 0, newRangeStart = 0, curRange = [],
          oldLine = 1, newLine = 1;
      for (var i = 0; i < diff.length; i++) {
        var current = diff[i],
            lines = current.lines || current.value.replace(/\n$/, '').split('\n');
        current.lines = lines;

        if (current.added || current.removed) {
          if (!oldRangeStart) {
            var prev = diff[i-1];
            oldRangeStart = oldLine;
            newRangeStart = newLine;

            if (prev) {
              curRange = contextLines(prev.lines.slice(-4));
              oldRangeStart -= curRange.length;
              newRangeStart -= curRange.length;
            }
          }
          curRange.push.apply(curRange, lines.map(function(entry) { return (current.added?'+':'-') + entry; }));
          eofNL(curRange, i, current);

          if (current.added) {
            newLine += lines.length;
          } else {
            oldLine += lines.length;
          }
        } else {
          if (oldRangeStart) {
            // Close out any changes that have been output (or join overlapping)
            if (lines.length <= 8 && i < diff.length-2) {
              // Overlapping
              curRange.push.apply(curRange, contextLines(lines));
            } else {
              // end the range and output
              var contextSize = Math.min(lines.length, 4);
              ret.push(
                  '@@ -' + oldRangeStart + ',' + (oldLine-oldRangeStart+contextSize)
                  + ' +' + newRangeStart + ',' + (newLine-newRangeStart+contextSize)
                  + ' @@');
              ret.push.apply(ret, curRange);
              ret.push.apply(ret, contextLines(lines.slice(0, contextSize)));
              if (lines.length <= 4) {
                eofNL(ret, i, current);
              }

              oldRangeStart = 0;  newRangeStart = 0; curRange = [];
            }
          }
          oldLine += lines.length;
          newLine += lines.length;
        }
      }

      return ret.join('\n') + '\n';
    },

    applyPatch: function(oldStr, uniDiff) {
      var diffstr = uniDiff.split('\n');
      var diff = [];
      var remEOFNL = false,
          addEOFNL = false;

      for (var i = (diffstr[0][0]==='I'?4:0); i < diffstr.length; i++) {
        if(diffstr[i][0] === '@') {
          var meh = diffstr[i].split(/@@ -(\d+),(\d+) \+(\d+),(\d+) @@/);
          diff.unshift({
            start:meh[3],
            oldlength:meh[2],
            oldlines:[],
            newlength:meh[4],
            newlines:[]
          });
        } else if(diffstr[i][0] === '+') {
          diff[0].newlines.push(diffstr[i].substr(1));
        } else if(diffstr[i][0] === '-') {
          diff[0].oldlines.push(diffstr[i].substr(1));
        } else if(diffstr[i][0] === ' ') {
          diff[0].newlines.push(diffstr[i].substr(1));
          diff[0].oldlines.push(diffstr[i].substr(1));
        } else if(diffstr[i][0] === '\\') {
          if (diffstr[i-1][0] === '+') {
            remEOFNL = true;
          } else if(diffstr[i-1][0] === '-') {
            addEOFNL = true;
          }
        }
      }

      var str = oldStr.split('\n');
      for (var i = diff.length - 1; i >= 0; i--) {
        var d = diff[i];
        for (var j = 0; j < d.oldlength; j++) {
          if(str[d.start-1+j] !== d.oldlines[j]) {
            return false;
          }
        }
        Array.prototype.splice.apply(str,[d.start-1,+d.oldlength].concat(d.newlines));
      }

      if (remEOFNL) {
        while (!str[str.length-1]) {
          str.pop();
        }
      } else if (addEOFNL) {
        str.push('');
      }
      return str.join('\n');
    },

    convertChangesToXML: function(changes){
      var ret = [];
      for ( var i = 0; i < changes.length; i++) {
        var change = changes[i];
        if (change.added) {
          ret.push('<ins>');
        } else if (change.removed) {
          ret.push('<del>');
        }

        ret.push(escapeHTML(change.value));

        if (change.added) {
          ret.push('</ins>');
        } else if (change.removed) {
          ret.push('</del>');
        }
      }
      return ret.join('');
    },

    // See: http://code.google.com/p/google-diff-match-patch/wiki/API
    convertChangesToDMP: function(changes){
      var ret = [], change;
      for ( var i = 0; i < changes.length; i++) {
        change = changes[i];
        ret.push([(change.added ? 1 : change.removed ? -1 : 0), change.value]);
      }
      return ret;
    }
  };
})();

if (typeof module !== 'undefined') {
    module.exports = JsDiff;
}

},{}],2:[function(require,module,exports){
(function(Perseus) {

require("./widgets/categorization.jsx");
require("./widgets/dropdown.jsx");
require("./widgets/example-widget.jsx");
require("./widgets/expression.jsx");
require("./widgets/input-number.jsx");
require("./widgets/interactive-graph.jsx");
require("./widgets/interactive-number-line.jsx");
require("./widgets/matcher.jsx");
require("./widgets/measurer.jsx");
require("./widgets/number-line.jsx");
require("./widgets/orderer.jsx");
require("./widgets/plotter.jsx");
require("./widgets/radio.jsx");
require("./widgets/sorter.jsx");
require("./widgets/table.jsx");
require("./widgets/text-input.jsx");
require("./widgets/transformer.jsx");

})(Perseus);


},{"./widgets/categorization.jsx":40,"./widgets/dropdown.jsx":41,"./widgets/example-widget.jsx":42,"./widgets/expression.jsx":43,"./widgets/input-number.jsx":44,"./widgets/interactive-graph.jsx":45,"./widgets/interactive-number-line.jsx":46,"./widgets/matcher.jsx":47,"./widgets/measurer.jsx":48,"./widgets/number-line.jsx":49,"./widgets/orderer.jsx":50,"./widgets/plotter.jsx":51,"./widgets/radio.jsx":52,"./widgets/sorter.jsx":53,"./widgets/table.jsx":54,"./widgets/text-input.jsx":55,"./widgets/transformer.jsx":56}],3:[function(require,module,exports){
/** @jsx React.DOM */
(function(Perseus) {

require("./core.js");
require("./renderer.jsx");
require("./editor.jsx");
var Util = require("./util.js");

var InfoTip = require("./components/info-tip.jsx");
var QuestionParagraph = require("./question-paragraph.jsx");
var Widgets = require("./widgets.js");
var Renderer = Perseus.Renderer;
var Editor = Perseus.Editor;

var AnswerAreaRenderer = Perseus.AnswerAreaRenderer = React.createClass({displayName: 'AnswerAreaRenderer',
    propTypes: {
        onInteractWithWidget: React.PropTypes.func.isRequired,
        shouldIndicate: React.PropTypes.bool.isRequired,
        usedWidgets: React.PropTypes.array.isRequired,
        numWidgetsRemaining: React.PropTypes.number,
        numWidgets: React.PropTypes.number
    },

    getInitialState: function() {
        // TODO(alpert): Move up to parent props?
        return {
            widget: {},
            cls: this.getClass(this.props.type)
        };
    },

    componentWillReceiveProps: function(nextProps) {
        this.setState({cls: this.getClass(nextProps.type)});
    },

    getClass: function(type) {
        if (type === "multiple") {
            return Renderer;
        } else {
            return Widgets.get(type);
        }
    },

    render: function() {
        var body;
        if (this.props.type === "multiple") {
            body = this.renderMultiple();
        } else {
            body = this.renderSingle();
        }
        return React.DOM.div(null, 
            this.props.shouldIndicate && React.DOM.div( {className:"remaining-parts"}, 
                this.props.numWidgetsRemaining, " /",' ',
                this.props.numWidgets,
                ' ',"remaining parts of this question"
            ),
            body
        );
    },

    renderMultiple: function() {
        return this.state.cls(_.extend({
            ref: "widget",
            problemNum: this.props.problemNum,
            onChange: this.handleChangeRenderer,
            onInteractWithWidget: this.props.onInteractWithWidget,
            usedWidgets: this.props.usedWidgets,
            shouldIndicate: this.props.shouldIndicate
        }, this.props.options, this.state.widget));
    },

    renderSingle: function() {
        return QuestionParagraph(
            {totalWidgets:["answer-area"],
            usedWidgets:this.props.usedWidgets,
            shouldIndicate:this.props.shouldIndicate} , 
            this.state.cls(_.extend({
                ref: "widget",
                problemNum: this.props.problemNum,
                onChange: this.handleChangeRenderer,
            }, this.props.options, this.state.widget))
        );
    },

    handleChangeRenderer: function(newProps, cb) {
        if (this.props.type !== "multiple") {
            this.props.onInteractWithWidget("answer-area");
        }
        var widget = _.extend({}, this.state.widget, newProps);
        this.setState({widget: widget}, cb);
    },

    componentDidMount: function() {
        this.$examples = $("<div id='examples'></div>");
        this.update();
    },

    componentDidUpdate: function() {
        this.update();
    },

    update: function() {
        $("#calculator").toggle(this.props.calculator);

        $("#examples-show").hide();
        if ($("#examples-show").data("qtip")) {
            $("#examples-show").qtip("destroy", /* immediate */ true);
        }

        var widget = this.refs.widget;
        var examples = widget.examples ? widget.examples() : null;

        if (examples && $("#examples-show").length) {
            $("#examples-show").append(this.$examples);

            var content = _.map(examples, function(example) {
                return "- " + example;
            }).join("\n");

            React.renderComponent(
                Renderer({content: content}),
                this.$examples[0]);

            $("#examples-show").qtip({
                content: {
                    text: this.$examples.remove()
                },
                style: {classes: "qtip-light leaf-tooltip"},
                position: {
                    my: "center right",
                    at: "center left"
                },
                show: {
                    delay: 200,
                    effect: {
                        length: 0
                    }
                },
                hide: {delay: 0}
            });

            $("#examples-show").show();
        }
    },

    componentWillUnmount: function() {
        if (this.props.calculator) {
            $("#calculator").hide();
        }
        if (this.state.cls.examples && $("#examples-show").length) {
            $("#examples-show").hide();
            React.unmountComponentAtNode(
                    document.getElementById("examples"));
        }
    },

    focus: function() {
        this.refs.widget.focus();
    },

    guessAndScore: function() {
        // TODO(alpert): These should probably have the same signature...
        if (this.props.type === "multiple") {
            return this.refs.widget.guessAndScore();
        } else {
            var guess = this.refs.widget.toJSON();

            var score;
            if (this.props.graded == null || this.props.graded) {
                // props.graded is unset or true
                // TODO(alpert): Separate out the rubric
                score = this.refs.widget.simpleValidate(this.props.options);
            } else {
                score = Util.noScore;
            }

            return [guess, score];
        }
    }
});

var AnswerAreaEditor = Perseus.AnswerAreaEditor = React.createClass({displayName: 'AnswerAreaEditor',
    getDefaultProps: function() {
        return {
            type: "input-number",
            options: {},
            calculator: false
        };
    },

    render: function() {
        var cls;
        if (this.props.type === "multiple") {
            cls = Editor;
        } else {
            cls = Widgets.get(this.props.type + "-editor");
        }

        var editor = cls(_.extend({
            ref: "editor",
            placeholder: "This answer area is being deprecated. " +
            "Please use the widgets in the question area for your answer.",
            onChange: function(newProps, cb) {
                var options = _.extend({}, this.props.options, newProps);
                this.props.onChange({options: options}, cb);
            }.bind(this)
        }, this.props.options));

        return React.DOM.div( {className:"perseus-answer-editor"}, 
            React.DOM.div( {className:"perseus-answer-options"}, 
            React.DOM.div(null, React.DOM.label(null, 
                ' ',"Show calculator:",' ',
                React.DOM.input( {type:"checkbox", checked:this.props.calculator,
                    onChange:function(e) {
                        this.props.onChange({calculator: e.target.checked});
                    }.bind(this)} )
            ),
            InfoTip(null, 
                React.DOM.p(null, "Use the calculator when completing difficult calculations is"+' '+
                "NOT the intent of the question. DON’T use the calculator when"+' '+
                "testing the student’s ability to complete different types of"+' '+
                "computations.")
            )
            ),
            React.DOM.div(null, React.DOM.label(null, 
                ' ',"Answer type:",' ',
                React.DOM.select( {value:this.props.type,
                        onChange:function(e) {
                            this.props.onChange({
                                type: e.target.value,
                                options: {}
                            }, function() {
                                this.refs.editor.focus();
                            }.bind(this));
                        }.bind(this)}, 
                    React.DOM.option( {value:"radio"}, "Multiple choice"),
                    React.DOM.option( {value:"table"}, "Table of values"),
                    React.DOM.option( {value:"input-number"}, "Text input (number)"),
                    React.DOM.option( {value:"expression"}, "Expression / Equation"),
                    React.DOM.option( {value:"multiple"}, "Custom format")
                )
            ),
            InfoTip(null, 
                React.DOM.p(null, "Use the custom format if the question is in the question"+' '+
                "area, and tell the students how to complete the problem.")
            ))
            ),
            React.DOM.div( {className:cls !== Editor ? "perseus-answer-widget" : ""}, 
                editor
            )
        );
    },

    toJSON: function(skipValidation) {
        // Could be just _.pick(this.props, "type", "options"); but validation!
        return {
            type: this.props.type,
            options: this.refs.editor.toJSON(skipValidation),
            calculator: this.props.calculator
        };
    }
});

})(Perseus);

},{"./components/info-tip.jsx":8,"./core.js":15,"./editor.jsx":22,"./question-paragraph.jsx":35,"./renderer.jsx":36,"./util.js":38,"./widgets.js":39}],4:[function(require,module,exports){
/** @jsx React.DOM */

/* You know when you want to propagate input to a parent...
 * but then that parent does something with the input...
 * then changing the props of the input...
 * on every keystroke...
 * so if some input is invalid or incomplete...
 * the input gets reset or otherwise effed...
 *
 * This is the solution.
 *
 * Enough melodrama. Its an input that only sends changes
 * to its parent on blur.
 */
var BlurInput = React.createClass({displayName: 'BlurInput',
    propTypes: {
        value: React.PropTypes.string.isRequired,
        onChange: React.PropTypes.func.isRequired
    },
    getInitialState: function() {
        return { value: this.props.value };
    },
    render: function() {
        return this.transferPropsTo(React.DOM.input(
            {type:"text",
            value:this.state.value,
            onChange:this.handleChange,
            onBlur:this.handleBlur} ));
    },
    componentWillReceiveProps: function(nextProps) {
        this.setState({ value: nextProps.value });
    },
    handleChange: function(e) {
        this.setState({ value: e.target.value });
    },
    handleBlur: function(e) {
        this.props.onChange(e.target.value);
    }
});

module.exports = BlurInput;

},{}],5:[function(require,module,exports){
/** @jsx React.DOM */

/* ButtonGroup is an aesthetically pleasing group of buttons.
 *
 * The class requires these properties:
 *   buttons - an array of objects with keys:
 *     "value": this is the value returned when the button is selected
 *     "text": this is the text shown on the button
 *     "title": this is the title-text shown on hover
 *   onChange - a function that is provided with the updated value
 *     (which it then is responsible for updating)
 *
 * The class has these optional properties:
 *   value - the initial value of the button selected, defaults to null.
 *   allowEmpty - if false, exactly one button _must_ be selected; otherwise
 *     it defaults to true and _at most_ one button (0 or 1) may be selected.
 *
 * Requires stylesheets/perseus-admin-package/editor.less to look nice.
 */

var ButtonGroup = React.createClass({displayName: 'ButtonGroup',
    propTypes: {
        value: React.PropTypes.string,
        buttons: React.PropTypes.array.isRequired,
        onChange: React.PropTypes.func.isRequired,
        allowEmpty: React.PropTypes.bool,
    },

    getDefaultProps: function() {
        return {
            value: null,
            allowEmpty: true
        };
    },

    render: function() {
        var buttons = this.props.buttons;
        var value = this.props.value;

        return React.DOM.div( {className:"perseus-button-group"}, 
            _.map(buttons, function(button, i) {
                return React.DOM.button( {title:button.title,
                    id:"" + i, key:  "" + i,
                    className:button.value === value ? "selected" : "",
                    onClick:this.toggleSelect.bind(this, button.value)}, 
                        button.text
                );
            }, this)
        );
    },

    focus: function() {
        this.getDOMNode().focus();
        return true;
    },

    toggleSelect: function(newValue) {
        var value = this.props.value;

        if (this.props.allowEmpty) {
            // Select the new button or unselect if it's already selected
            this.props.onChange(value !== newValue ? newValue : null);
        } else {
            this.props.onChange(newValue);
        }
    }
});

module.exports = ButtonGroup;

},{}],6:[function(require,module,exports){
/** @jsx React.DOM */

require("../core.js");
var Util = require("../util.js");

var Changeable  = require("../mixins/changeable.jsx");
var InfoTip     = require("../components/info-tip.jsx");
var NumberInput = require("../components/number-input.jsx");

var defaultBoxSize = 400;
var defaultBackgroundImage = {
    url: null,
    scale: 1,
    bottom: 0,
    left: 0,
};

function numSteps(range, step) {
    return Math.floor((range[1] - range[0]) / step);
}

var GraphSettings = React.createClass({displayName: 'GraphSettings',

    mixins: [Changeable],

    getInitialState: function() {
        return {
            labelsTextbox: this.props.labels,
            gridStepTextbox: this.props.gridStep,
            snapStepTextbox: this.props.snapStep,
            stepTextbox: this.props.step,
            rangeTextbox: this.props.range
        };
    },

    getDefaultProps: function() {
        return {
            box: [340, 340],
            labels: ["x", "y"],
            range: [[-10, 10], [-10, 10]],
            step: [1, 1],
            gridStep: [1, 1],
            snapStep: Util.snapStepFromGridStep(
                this.props.gridStep || [1, 1]),
            valid: true,
            backgroundImage: defaultBackgroundImage,
            markings: "graph",
            showProtractor: false,
            showRuler: false,
            rulerLabel: "",
            rulerTicks: 10
        };
    },

    render: function() {
        return React.DOM.div(null, 
            React.DOM.div( {className:"graph-settings"}, 
                React.DOM.div(null, "x label:",' ',
                    React.DOM.input(  {type:"text",
                            ref:"labels-0",
                            onChange:_.bind(this.changeLabel, this, 0),
                            value:this.state.labelsTextbox[0]} )
                ),
                React.DOM.div(null, "y label:",' ',
                    React.DOM.input(  {type:"text",
                            ref:"labels-1",
                            onChange:_.bind(this.changeLabel, this, 1),
                            value:this.state.labelsTextbox[1]} )
                ),
                React.DOM.div(null, "x range:",' ',
                    React.DOM.input(  {type:"text",
                            ref:"range-0-0",
                            onChange:_.bind(this.changeRange, this, 0, 0),
                            value:this.state.rangeTextbox[0][0]} ),
                    React.DOM.input(  {type:"text",
                            ref:"range-0-1",
                            onChange:_.bind(this.changeRange, this, 0, 1),
                            value:this.state.rangeTextbox[0][1]} )
                ),
                React.DOM.div(null, 
                    ' ',"y range:",' ',
                    React.DOM.input(  {type:"text",
                            ref:"range-1-0",
                            onChange:_.bind(this.changeRange, this, 1, 0),
                            value:this.state.rangeTextbox[1][0]} ),
                    React.DOM.input(  {type:"text",
                            ref:"range-1-1",
                            onChange:_.bind(this.changeRange, this, 1, 1),
                            value:this.state.rangeTextbox[1][1]} )
                ),
                React.DOM.div(null, 
                    ' ',"Tick Step:",' ',
                    React.DOM.input(  {type:"text",
                            ref:"step-0",
                            onChange:_.bind(this.changeStep, this, 0),
                            value:this.state.stepTextbox[0]} ),
                    React.DOM.input(  {type:"text",
                            ref:"step-1",
                            onChange:_.bind(this.changeStep, this, 1),
                            value:this.state.stepTextbox[1]} )
                ),
                React.DOM.div(null, 
                    ' ',"Grid Step:",' ',
                    NumberInput(
                        {ref:"grid-step-0",
                        onChange:_.bind(this.changeGridStep, this, 0),
                        value:this.state.gridStepTextbox[0]} ),
                    NumberInput(
                        {ref:"grid-step-1",
                        onChange:_.bind(this.changeGridStep, this, 1),
                        value:this.state.gridStepTextbox[1]} )
                ),
                React.DOM.div(null, 
                    ' ',"Snap Step:",' ',
                    NumberInput(
                        {ref:"snap-step-0",
                        onChange:_.bind(this.changeSnapStep, this, 0),
                        value:this.state.snapStepTextbox[0]} ),
                    NumberInput(
                        {ref:"snap-step-1",
                        onChange:_.bind(this.changeSnapStep, this, 1),
                        value:this.state.snapStepTextbox[1]} )
                ),
                React.DOM.div(null, 
                    React.DOM.label(null, "Markings:",' ',
                        React.DOM.select( {value:this.props.markings,
                                onChange:this.changeMarkings}, 
                            React.DOM.option( {value:"graph"}, "Graph (axes + grid)"),
                            React.DOM.option( {value:"grid"}, "Grid only"),
                            React.DOM.option( {value:"none"}, "None")
                        )
                    )
                )
            ),
            React.DOM.div( {className:"image-settings"}, 
                React.DOM.div(null, "Background image:"),
                React.DOM.div(null, "Url:",' ',
                    React.DOM.input( {type:"text",
                            className:"graph-settings-background-url",
                            ref:"bg-url",
                            defaultValue:this.props.backgroundImage.url,
                            onKeyPress:this.changeBackgroundUrl,
                            onBlur:this.changeBackgroundUrl} ),
                    InfoTip(null, 
                        React.DOM.p(null, "Create an image in graphie, or use the \"Add image\""+' '+
                        "function to create a background.")
                    )
                ),
                this.props.backgroundImage.url && React.DOM.div(null, 
                    React.DOM.div(null, "Pixels from left:",' ',
                        React.DOM.input( {type:"text",
                                ref:"bg-left",
                                value:this.props.backgroundImage.left,
                                onChange:
                        _.partial(this.changeBackgroundSetting, "left")} )
                    ),
                    React.DOM.div(null, "Pixels from bottom:",' ',
                        React.DOM.input( {type:"text",
                                ref:"bg-bottom",
                                value:this.props.backgroundImage.bottom,
                                onChange:
                        _.partial(this.changeBackgroundSetting, "bottom")} )
                    ),
                    React.DOM.div(null, "Image scale:",' ',
                        React.DOM.input( {type:"text",
                                ref:"bg-scale",
                                value:this.props.backgroundImage.scale,
                                onChange:
                        _.partial(this.changeBackgroundSetting, "scale")} )
                    )
                )
            ),
            React.DOM.div( {className:"misc-settings"}, 
                React.DOM.div(null, 
                    React.DOM.label(null, 
                        ' ',"Show protractor:",' ',
                        React.DOM.input( {type:"checkbox",
                            checked:this.props.showProtractor,
                            onChange:this.toggleShowProtractor} )
                    )
                ),
                React.DOM.div(null, 
                    React.DOM.label(null, 
                        ' ',"Show ruler:",' ',
                        React.DOM.input( {type:"checkbox",
                            checked:this.props.showRuler,
                            onChange:this.toggleShowRuler} )
                    )
                ),
                this.props.showRuler && React.DOM.div(null, 
                    React.DOM.div(null, 
                        React.DOM.label(null, 
                            ' ',"Ruler label:",' ',
                            React.DOM.select(
                                {onChange:this.changeRulerLabel,
                                value:this.props.rulerLabel} , 
                                    React.DOM.option( {value:""}, "None"),
                                    React.DOM.optgroup( {label:"Metric"}, 
                                        this.renderLabelChoices([
                                            ["milimeters", "mm"],
                                            ["centimeters", "cm"],
                                            ["meters", "m"],
                                            ["kilometers", "km"]
                                        ])
                                    ),
                                    React.DOM.optgroup( {label:"Imperial"}, 
                                        this.renderLabelChoices([
                                            ["inches", "in"],
                                            ["feet", "ft"],
                                            ["yards", "yd"],
                                            ["miles", "mi"]
                                        ])
                                    )
                            )
                        )
                    ),
                    React.DOM.div(null, 
                        React.DOM.label(null, 
                            ' ',"Ruler ticks:",' ',
                            React.DOM.select(
                                {onChange:this.changeRulerTicks,
                                value:this.props.rulerTicks} , 
                                    _.map([1, 2, 4, 8, 10, 16], function(n) {
                                        return React.DOM.option( {value:n}, n);
                                    })
                            )
                        )
                    )
                )
            )
        );
    },

    renderLabelChoices: function(choices) {
        return _.map(choices, function(nameAndValue) {
            return React.DOM.option( {value:nameAndValue[1]}, nameAndValue[0]);
        });
    },

    componentDidMount: function() {
        var changeGraph = this.changeGraph;
        this.changeGraph = _.debounce(_.bind(changeGraph, this), 300);
    },


    validRange: function(range) {
        var numbers = _.every(range, function(num) {
            return _.isFinite(num);
        });
        if (! numbers) {
            return "Range must be a valid number";
        }
        if (range[0] >= range[1]) {
            return "Range must have a higher number on the right";
        }
        return true;
    },

    validateStepValue: function(settings) {
        var step = settings.step;
        var range = settings.range;
        var name = settings.name;
        var minTicks = settings.minTicks;
        var maxTicks = settings.maxTicks;

        if (! _.isFinite(step)) {
            return name + " must be a valid number";
        }
        var nSteps = numSteps(range, step);
        if (nSteps < minTicks) {
            return name + " is too large, there must be at least " +
               minTicks + " ticks.";
        }
        if (nSteps > maxTicks) {
            return name + " is too small, there can be at most " +
               maxTicks + " ticks.";
        }
        return true;
    },

    validSnapStep: function(step, range) {
        return this.validateStepValue({
            step: step,
            range: range,
            name: "Snap step",
            minTicks: 5,
            maxTicks: 60
        });
    },

    validGridStep: function(step, range) {
        return this.validateStepValue({
            step: step,
            range: range,
            name: "Grid step",
            minTicks: 3,
            maxTicks: 60
        });
    },

    validStep: function(step, range) {
        return this.validateStepValue({
            step: step,
            range: range,
            name: "Step",
            minTicks: 3,
            maxTicks: 20
        });
    },

    validateGraphSettings: function(range, step, gridStep, snapStep) {
        var self = this;
        var msg;
        var goodRange = _.every(range, function(range) {
            msg = self.validRange(range);
            return msg === true;
        });
        if (!goodRange) {
            return msg;
        }
        var goodStep = _.every(step, function(step, i) {
            msg = self.validStep(step, range[i]);
            return msg === true;
        });
        if (!goodStep) {
            return msg;
        }
        var goodGridStep = _.every(gridStep, function(gridStep, i) {
            msg = self.validGridStep(gridStep, range[i]);
            return msg === true;
        });
        if (!goodGridStep) {
            return msg;
        }
        var goodSnapStep = _.every(snapStep, function(snapStep, i) {
            msg = self.validSnapStep(snapStep, range[i]);
            return msg === true;
        });
        if (!goodSnapStep) {
            return msg;
        }
        return true;
    },

    changeLabel: function(i, e) {
        var val = e.target.value;
        var labels = this.state.labelsTextbox.slice();
        labels[i] = val;
        this.setState({ labelsTextbox: labels }, this.changeGraph);
    },

    changeRange: function(i, j, e) {
        var val = this.refs["range-" + i + "-" + j].getDOMNode().value;
        var ranges = this.state.rangeTextbox.slice();
        var range = ranges[i] = ranges[i].slice();
        range[j] = val;
        var step = this.state.stepTextbox.slice();
        var gridStep = this.state.gridStepTextbox.slice();
        var snapStep = this.state.snapStepTextbox.slice();
        var scale = Util.scaleFromExtent(range, this.props.box[i]);
        if (this.validRange(range) === true) {
            step[i] = Util.tickStepFromExtent(
                    range, this.props.box[i]);
            gridStep[i] = Util.gridStepFromTickStep(step[i], scale);
            snapStep[i] = gridStep[i] / 2;
        }
        this.setState({
            stepTextbox: step,
            gridStepTextbox: gridStep,
            snapStepTextbox: snapStep,
            rangeTextbox: ranges
        }, this.changeGraph);
    },

    changeStep: function(i, e) {
        var val = this.refs["step-" + i].getDOMNode().value;
        var step = this.state.stepTextbox.slice();
        step[i] = val;
        this.setState({ stepTextbox: step }, this.changeGraph);
    },

    changeSnapStep: function(i, e) {
        var val = this.refs["snap-step-" + i].getValue();
        var snapStep = this.state.snapStepTextbox.slice();
        snapStep[i] = val;
        this.setState({ snapStepTextbox: snapStep },
                this.changeGraph);
    },

    changeGridStep: function(i, e) {
        var val = this.refs["grid-step-" + i].getValue();
        var gridStep = this.state.gridStepTextbox.slice();
        gridStep[i] = val;
        this.setState({
            gridStepTextbox: gridStep,
            snapStepTextbox: _.map(gridStep, function(step) {
                return step / 2;
            })
        }, this.changeGraph);
    },

    changeMarkings: function(e) {
        this.change("markings", e.target.value);
    },

    changeGraph: function() {
        var labels = this.state.labelsTextbox;
        var range = _.map(this.state.rangeTextbox, function(range) {
            return _.map(range, Number);
        });
        var step = _.map(this.state.stepTextbox, Number);
        var gridStep = this.state.gridStepTextbox;
        var snapStep = this.state.snapStepTextbox;

        // validationResult is either:
        //   true -> the settings are valid
        //   a string -> the settings are invalid, and the explanation
        //               is contained in the string
        // TODO(jack): Refactor this to not be confusing
        var validationResult = this.validateGraphSettings(range, step,
                gridStep, snapStep);

        if (validationResult === true) {  // either true or a string
            this.change({
                valid: true,
                labels: labels,
                range: range,
                step: step,
                gridStep: gridStep,
                snapStep: snapStep
            });
        } else {
            this.change({
                valid: validationResult  // a string message, not false
            });
        }
    },

    changeBackgroundUrl: function(e) {
        var self = this;

        // Only continue on blur or "enter"
        if (e.type === "keypress" && e.keyCode !== 13) {
            return;
        }

        var url = self.refs["bg-url"].getDOMNode().value;
        var setUrl = function() {
            var image = _.clone(self.props.backgroundImage);
            image.url = url;
            image.width = img.width;
            image.height = img.height;
            self.props.onChange({
                backgroundImage: image,
                markings: url ? "none" : "graph"
            });
        };
        if (url) {
            var img = new Image();
            img.onload = setUrl;
            img.src = url;
        } else {
            var img = {
                url: url,
                width: 0,
                height: 0
            };
            setUrl();
        }
    },

    changeBackgroundSetting: function(type, e) {
        var image = _.clone(this.props.backgroundImage);
        image[type] = e.target.value;
        this.change({ backgroundImage: image });
    },

    // TODO(jack): Make these PropCheckboxes or something
    toggleShowProtractor: function() {
        this.change({showProtractor: !this.props.showProtractor});
    },

    toggleShowRuler: function() {
        this.change({showRuler: !this.props.showRuler});
    },

    // TODO(jack): Make either a wrapper for standard events to work
    // with this.change, or make these use some TextInput/NumberInput box
    changeRulerLabel: function(e) {
        this.change({rulerLabel: e.target.value});
    },

    changeRulerTicks: function(e) {
        this.change({rulerTicks: +e.target.value});
    }
});

module.exports = GraphSettings;


},{"../components/info-tip.jsx":8,"../components/number-input.jsx":9,"../core.js":15,"../mixins/changeable.jsx":33,"../util.js":38}],7:[function(require,module,exports){
/** @jsx React.DOM */

require("../core.js");
var Util = require("../util.js");

var defaultBoxSize = 400;
var defaultBackgroundImage = {
    url: null,
    scale: 1,
    bottom: 0,
    left: 0,
};

function numSteps(range, step) {
    return Math.floor((range[1] - range[0]) / step);
}

var Graph = React.createClass({displayName: 'Graph',
    propTypes: {
        box: React.PropTypes.array.isRequired
    },

    getDefaultProps: function() {
        return {
            box: [defaultBoxSize, defaultBoxSize],
            labels: ["x", "y"],
            range: [[-10, 10], [-10, 10]],
            step: [1, 1],
            gridStep: [1, 1],
            snapStep: [0.5, 0.5],
            markings: "graph",
            backgroundImage: defaultBackgroundImage,
            showProtractor: false,
            showRuler: false,
            rulerLabel: "",
            rulerTicks: 10,
            onNewGraphie: null,
            onClick: null
        };
    },

    render: function() {
        var image = this.props.backgroundImage;
        if (image.url) {
            var preScale = this.props.box[0] / defaultBoxSize;
            var scale = image.scale * preScale;
            var style = {
                bottom: (preScale * image.bottom) + "px",
                left: (preScale * image.left) + "px",
                width: (scale * image.width) + "px",
                height: (scale * image.height) + "px"
            };
            image = React.DOM.img( {style:style, src:image.url} );
        } else {
            image = null;
        }

        return React.DOM.div(
                {className:"graphie-container above-scratchpad",
                style:{
                    width: this.props.box[0],
                    height: this.props.box[1]
                }}, 
            image,
            React.DOM.div( {className:"graphie", ref:"graphieDiv"} )
        );
    },

    componentDidMount: function() {
        this._setupGraphie();
    },

    componentDidUpdate: function() {
        // Only setupGraphie once per componentDidUpdate().
        // See explanation in setupGraphie().
        this._hasSetupGraphieThisUpdate = false;
        if (this._shouldSetupGraphie) {
            this._setupGraphie();
            this._shouldSetupGraphie = false;
        }
    },

    componentWillReceiveProps: function(nextProps) {
        var potentialChanges = ["labels", "range", "step", "markings",
            "showProtractor", "showRuler", "rulerLabel", "rulerTicks",
            "gridStep", "snapStep"];
        var self = this;
        _.each(potentialChanges, function(prop) {
            if (!_.isEqual(self.props[prop], nextProps[prop])) {
                self._shouldSetupGraphie = true;
            }
        });
    },

    /* Reset the graphie canvas to its initial state
     *
     * Use when re-rendering the parent component and you need a blank
     * graphie.
     */
    reset: function() {
        this._setupGraphie();
    },

    graphie: function() {
        return this._graphie;
    },

    pointsFromNormalized: function(coordsList, noSnap) {
        var self = this;
        return _.map(coordsList, function(coords) {
            return _.map(coords, function(coord, i) {
                var range = self.props.range[i];
                if (noSnap) {
                    return range[0] + (range[1] - range[0]) * coord;
                } else {
                    var step = self.props.step[i];
                    var nSteps = numSteps(range, step);
                    var tick = Math.round(coord * nSteps);
                    return range[0] + step * tick;
                }
            });
        });
    },

    _setupGraphie: function() {
        // Only setupGraphie once per componentDidUpdate().
        // This prevents this component from rendering graphie
        // and then immediately re-render graphie because its
        // parent component asked it to. This will happen when
        // props on the parent and props on this component both
        // require graphie to be re-rendered.
        if (this._hasSetupGraphieThisUpdate) {
            return;
        }

        var graphieDiv = this.refs.graphieDiv.getDOMNode();
        $(graphieDiv).empty();
        var labels = this.props.labels;
        var range = this.props.range;
        var graphie = this._graphie = KhanUtil.createGraphie(graphieDiv);

        var gridConfig = this._getGridConfig();
        graphie.snap = this.props.snapStep;

        if (this.props.markings === "graph") {
            graphie.graphInit({
                range: range,
                scale: _.pluck(gridConfig, "scale"),
                axisArrows: "<->",
                labelFormat: function(s) { return "\\small{" + s + "}"; },
                gridStep: this.props.gridStep,
                tickStep: _.pluck(gridConfig, "tickStep"),
                labelStep: 1,
                unityLabels: _.pluck(gridConfig, "unityLabel")
            });
            graphie.label([0, range[1][1]], labels[1], "above");
            graphie.label([range[0][1], 0], labels[0], "right");
        } else if (this.props.markings === "grid") {
            graphie.graphInit({
                range: range,
                scale: _.pluck(gridConfig, "scale"),
                gridStep: this.props.gridStep,
                axes: false,
                ticks: false,
                labels: false
            });
        } else if (this.props.markings === "none") {
            graphie.init({
                range: range,
                scale: _.pluck(gridConfig, "scale")
            });
        }

        graphie.addMouseLayer({
            onClick: this.props.onClick,
            allowScratchpad: true
        });

        this._updateProtractor();
        this._updateRuler();

        // We set this flag before jumping into our callback
        // to avoid recursing if our callback calls reset() itself
        this._hasSetupGraphieThisUpdate = true;
        if (this.props.onNewGraphie) {
            this.props.onNewGraphie(graphie);
        }
    },

    _getGridConfig: function() {
        var self = this;
        return _.map(self.props.step, function(step, i) {
            return Util.gridDimensionConfig(
                    step,
                    self.props.range[i],
                    self.props.box[i],
                    self.props.gridStep[i]);
        });
    },

    _updateProtractor: function() {
        if (this.protractor) {
            this.protractor.remove();
        }

        if (this.props.showProtractor) {
            var coord = this.pointsFromNormalized([[0.50, 0.05]])[0];
            this.protractor = this._graphie.protractor(coord);
        }
    },

    _updateRuler: function() {
        if (this.ruler) {
            this.ruler.remove();
        }

        if (this.props.showRuler) {
            var coord = this.pointsFromNormalized([[0.50, 0.25]])[0];
            var extent = this._graphie.range[0][1] - this._graphie.range[0][0];
            this.ruler = this._graphie.ruler({
                center: coord,
                label: this.props.rulerLabel,
                pixelsPerUnit: this._graphie.scale[0],
                ticksPerUnit: this.props.rulerTicks,
                units: Math.round(0.8 * extent)
            });
        }
    },

    toJSON: function() {
        return _.pick(this.props, 'range', 'step', 'markings', 'labels',
                      'backgroundImage', 'showProtractor', 'showRuler',
                      'rulerLabel', 'rulerTicks', 'gridStep', 'snapStep');
    }
});

module.exports = Graph;


},{"../core.js":15,"../util.js":38}],8:[function(require,module,exports){
/** @jsx React.DOM */

var InfoTip = React.createClass({displayName: 'InfoTip',
    getInitialState: function() {
        return {
            hover: false
        };
    },

    render: function() {
        return React.DOM.span( {className:"perseus-info-tip"}, 
            React.DOM.i( {className:"icon-question-sign",
                onMouseEnter:this.handleMouseEnter,
                onMouseLeave:this.handleMouseLeave} ),
            React.DOM.span( {className:"perseus-info-tip-container",
                    style:{display: this.state.hover ? 'block' : 'none'}}, 
                React.DOM.span( {className:"perseus-info-tip-triangle"}),
                React.DOM.span( {className:"perseus-info-tip-content-container " +
                        "vertical-shadow"}, 
                    this.props.children
                )
            )
        );
    },

    handleMouseEnter: function() {
        this.setState({hover: true});
    },

    handleMouseLeave: function() {
        this.setState({hover: false});
    }
});

module.exports = InfoTip;

},{}],9:[function(require,module,exports){
/** @jsx React.DOM */

require("../core.js");
var Util = require("../util.js");
var knumber = KhanUtil.knumber;

/* If str represents a valid number, return that number.
 * Otherwise, if str is empty and allowEmpty is true, return
 * null.
 * Otherwise, return defaultValue
 */
function numberFromString(str, defaultValue, allowEmpty) {
    if (str === "") {
        return allowEmpty ? null : defaultValue;
    } else {
        var result = Util.firstNumericalParse(str);
        return _.isFinite(result) ? result : defaultValue;
    }
}

var isNumericString = (function() {
    // Specify a result that could only be returned by
    // numberFromString if it was specified as the default
    // null and undefined are less nice because numberFromString
    // could return null if allowEmpty is true, and we want
    // that case to return true here.
    var defaultResult = {};
    return function isNumericString(str, allowEmpty) {
        var result = numberFromString(str, defaultResult, allowEmpty);
        return result !== defaultResult;
    };
})();

// TODO (jack): It would be nice if this did more of the inverse of
// numberFromString, handling fractions and such.
function stringFromNumber(num) {
    return num != null ? String(num) : "";
}

/* An input box that accepts only numbers
 *
 * Calls onChange when a valid number is entered.
 * Reverts to the current value onBlur or on [ENTER]
 * Optionally accepts empty input and sends it to
 * onChange as null
 */
var NumberInput = React.createClass({displayName: 'NumberInput',
    getDefaultProps: function() {
        return {
            allowEmpty: false,
            value: null,
            placeholder: null
        };
    },

    render: function() {
        cx = React.addons.classSet;

        var classes = cx({
            "number-input": true,
            "number-input-label": this.props.label != null
        });

        var input = React.DOM.input(_.extend({}, this.props, {
            className: classes,
            type: "text",
            onChange: this._handleChange,
            onBlur: this._handleBlur,
            onKeyPress: this._handleBlur,
            defaultValue: stringFromNumber(this.props.value),
            value: undefined
        }));

        if (this.props.label) {
            return React.DOM.label(null, this.props.label,input);
        } else {
            return input;
        }
    },

    componentDidUpdate: function(prevProps) {
        if (!knumber.equal(this.getValue(), this.props.value)) {
            this._setValue(this.props.value);
        }
    },

    /* Return true if the empty string is a valid value for our text input
     *
     * This is the case if props.allowEmpty is explicitly specified, or if
     * a placeholder value is specified (which will be returned instead of
     * null in the case of an empty text input)
     */
    _allowEmpty: function() {
        return this.props.allowEmpty || this.props.placeholder != null;
    },

    /* Return the current value of this input
     *
     * Takes into account whether props.allowEmpty is specified (allowing null
     * to be returned in the case of an empty string), and props.placeholder,
     * which will be returned in the case of an empty string otherwise.
     */
    getValue: function() {
        var text = this.getDOMNode().value;
        var num = numberFromString(text, this.props.value, true);
        if (num !== null) {
            return num;
        } else if (this.props.allowEmpty) {
            return null;
        } else if (this.props.placeholder != null) {
            return this.props.placeholder;
        } else {
            return this.props.value;
        }
    },

    /* Set text input focus to this input */
    focus: function() {
        this.getDOMNode().focus();
    },

    _handleChange: function(e) {
        var text = e.target.value;
        if (isNumericString(text, this._allowEmpty())) {
            this.props.onChange(this.getValue());
        }
    },

    // TODO (jack): This should revert to the last valid string
    // rather than the string of the number, to avoid situations
    // like "2/3a" turning into "0.66666666666..."
    _handleBlur: function(e) {
        // Only continue on blur or "enter"
        if (e.type === "keypress" && e.keyCode !== 13) {
            return;
        }

        var text = this.getDOMNode().value;
        if (!isNumericString(text, this._allowEmpty())) {
            this._setValue(this.props.value);
        }
    },

    _setValue: function(val) {
        $(this.getDOMNode()).val(stringFromNumber(val));
    }
});

module.exports = NumberInput;


},{"../core.js":15,"../util.js":38}],10:[function(require,module,exports){
/** @jsx React.DOM */

require("../core.js");

/* A checkbox that syncs its value to props using the
 * renderer's onChange method, and gets the prop name
 * dynamically from its props list
 */
var PropCheckBox = React.createClass({displayName: 'PropCheckBox',
    propTypes: {
        labelAlignment: React.PropTypes.oneOf(["left", "right"])
    },

    DEFAULT_PROPS: {
        label: null,
        onChange: null,
        labelAlignment: "left"
    },

    getDefaultProps: function() {
        return this.DEFAULT_PROPS;
    },

    propName: function() {
        var propName = _.find(_.keys(this.props), function(localPropName) {
            return !_.has(this.DEFAULT_PROPS, localPropName);
        }, this);

        if (!propName) {
            throw new Error("Attempted to create a PropCheckBox with no " +
                    "prop!");
        }

        return propName;
    },

    _labelAlignLeft: function() {
        return this.props.labelAlignment === "left";
    },

    render: function() {
        var propName = this.propName();
        return React.DOM.label(null, 
            this._labelAlignLeft() && this.props.label,
            React.DOM.input( {type:"checkbox",
                    checked:this.props[propName],
                    onChange:this.toggle} ),
            !this._labelAlignLeft() && this.props.label
        );
    },

    toggle: function() {
        var propName = this.propName();
        var changes = {};
        changes[propName] = !this.props[propName];
        this.props.onChange(changes);
    }
});

module.exports = PropCheckBox;


},{"../core.js":15}],11:[function(require,module,exports){
/** @jsx React.DOM */

var ValidatedNumberInput = require("../components/validated-number-input.jsx");

/* A minor abstraction on top of NumberInput for ranges
 *
 */
var RangeInput = React.createClass({displayName: 'RangeInput',
    propTypes: {
        value: React.PropTypes.array,
        placeholder: React.PropTypes.array,
        checkValidity: React.PropTypes.func
    },

    render: function() {
        var value = this.props.value;
        var checkValidity = this.props.checkValidity || (function()  {return true;});

        return React.DOM.div( {className:"range-input"}, 
            "[",
            this.transferPropsTo(ValidatedNumberInput(
                {value:value[0],
                checkValidity:function(val)  {return checkValidity([val, value[1]]);},
                onChange:this.onChange.bind(this, 0)} )),
            ",",
            this.transferPropsTo(ValidatedNumberInput(
                {value:value[1],
                checkValidity:function(val)  {return checkValidity([value[0], val]);},
                onChange:this.onChange.bind(this, 1)} )),
            "]"
        );
    },

    onChange: function(i, newVal) {
        var value = this.props.value;
        if (i === 0) {
            this.props.onChange([newVal, value[1]]);
        } else {
            this.props.onChange([value[0], newVal]);
        }
    }

});

module.exports = RangeInput;

},{"../components/validated-number-input.jsx":14}],12:[function(require,module,exports){
/** @jsx React.DOM */
(function(Perseus) {

require("../core.js");
require("../renderer.jsx");

var Renderer = Perseus.Renderer;

var PREFIX = "perseus-sortable";


// A placeholder that appears in the sortable whenever an item is dragged.
var Placeholder = React.createClass({displayName: 'Placeholder',
    propTypes: {
        width: React.PropTypes.number.isRequired,
        height: React.PropTypes.number.isRequired
    },

    render: function() {
        var className = [PREFIX + "-card", PREFIX + "-placeholder"].join(" ");
        var style = {width: this.props.width, height: this.props.height};

        if (this.props.margin != null) {
            style.margin = this.props.margin;
        }

        return React.DOM.li( {className:className, style:style} );
    }
});


var STATIC = "static",
    DRAGGING = "dragging",
    ANIMATING = "animating",
    DISABLED = "disabled";

// A draggable item in the sortable. Can be in one of four states:
//     Static:    The item is not being interacted with.
//     Dragging:  The item is being dragged.
//     Animating: The item has been released, and is moving to its destination.
//     Disabled:  The item cannot be interacted with.
//
// Usual flow:      Static -> Dragging -> Animating -> Static
// [Dis|en]abling:  Static|Dragging|Animating -> Disabled -> Static
var Draggable = React.createClass({displayName: 'Draggable',
    propTypes: {
        type: React.PropTypes.oneOf([STATIC, DRAGGING, ANIMATING, DISABLED]),
        content: React.PropTypes.string.isRequired,
        endPosition: React.PropTypes.object.isRequired,
        onRender: React.PropTypes.func.isRequired,
        onMouseDown: React.PropTypes.func.isRequired,
        onMouseMove: React.PropTypes.func.isRequired,
        onMouseUp: React.PropTypes.func.isRequired,
        onAnimationEnd: React.PropTypes.func.isRequired
    },

    getDefaultProps: function() {
        return {
            type: STATIC
        };
    },

    getInitialState: function() {
        return {
            startPosition: {left: 0, top: 0},
            startMouse: {left: 0, top: 0},
            mouse: {left: 0, top: 0}
        };
    },

    getCurrentPosition: function() {
        return {
            left: this.state.startPosition.left +
                  this.state.mouse.left -
                  this.state.startMouse.left,
            top: this.state.startPosition.top +
                 this.state.mouse.top -
                 this.state.startMouse.top
        };
    },

    render: function() {
        var className = [
                PREFIX + "-card",
                PREFIX + "-draggable",
                PREFIX + "-" + this.props.type
            ].join(" ");

        var style = {
            position: "static"
        };

        if (this.props.type === DRAGGING || this.props.type === ANIMATING) {
            _.extend(style, {position: "absolute"}, this.getCurrentPosition());
        }

        if (this.props.width) {
            style.width = this.props.width + 1; // Fix for non-integer widths
        }
        if (this.props.height) {
            style.height = this.props.height;
        }
        if (this.props.margin != null) {
            style.margin = this.props.margin;
        }

        return React.DOM.li(
                    {className:className,
                    style:style,
                    onMouseDown:this.onMouseDown,
                    onTouchStart:this.onMouseDown} , 
            Renderer(
                {content:this.props.content,
                onRender:this.props.onRender} )
        );
    },

    componentDidUpdate: function(prevProps) {
        if (this.props.type === prevProps.type) {
            return;
        }

        if (this.props.type === ANIMATING) {
            // Start animating
            var current = this.getCurrentPosition();
            var duration = 15 * Math.sqrt(
                Math.sqrt(
                    Math.pow(this.props.endPosition.left - current.left, 2) +
                    Math.pow(this.props.endPosition.top - current.top, 2)
                )
            );

            $(this.getDOMNode()).animate(this.props.endPosition, {
                duration: Math.max(duration, 1),
                // Animating -> Static
                complete: this.props.onAnimationEnd
            });
        } else if (this.props.type === STATIC) {
            // Ensure that any animations are done
            $(this.getDOMNode()).finish();
        }
    },

    onMouseDown: function(event) {
        if (this.props.type !== STATIC) {
            return;
        }

        if (!(event.button === 0 ||
                (event.touches != null && event.touches.length === 1))) {
            return;
        }

        event.preventDefault();
        var normalizedEvent = event.touches != null ? event.touches[0] : event;
        var mouse = {
            left: normalizedEvent.pageX,
            top: normalizedEvent.pageY
        };

        this.setState({
            startPosition: $(this.getDOMNode()).position(),
            startMouse: mouse,
            mouse: mouse
        }, function() {
            $(document).on("vmousemove", this.onMouseMove);
            $(document).on("vmouseup", this.onMouseUp);

            // Static -> Dragging
            this.props.onMouseDown();
        });
    },

    onMouseMove: function(event) {
        if (this.props.type !== DRAGGING) {
            return;
        }

        event.preventDefault();
        this.setState({
            mouse: {
                left: event.pageX,
                top: event.pageY
            }
        }, this.props.onMouseMove);
    },

    onMouseUp: function(event) {
        if (this.props.type !== DRAGGING) {
            return;
        }

        event.preventDefault();
        $(document).off("vmousemove", this.onMouseMove);
        $(document).off("vmouseup", this.onMouseUp);

        // Dragging -> Animating
        this.props.onMouseUp();
    }
});


var HORIZONTAL = "horizontal",
    VERTICAL = "vertical";

// The main sortable component.
var Sortable = React.createClass({displayName: 'Sortable',
    propTypes: {
        options: React.PropTypes.array.isRequired,
        layout: React.PropTypes.oneOf([HORIZONTAL, VERTICAL]),
        padding: React.PropTypes.bool,
        disabled: React.PropTypes.bool,
        constraints: React.PropTypes.object,
        onMeasure: React.PropTypes.func,
        margin: React.PropTypes.number,
        onChange: React.PropTypes.func
    },

    getDefaultProps: function() {
        return {
            layout: HORIZONTAL,
            padding: true,
            disabled: false,
            constraints: {},
            onMeasure: function() {},
            margin: 5,
            onChange: function() {}
        };
    },

    getInitialState: function() {
        return {
            items: this.itemsFromProps(this.props)
        };
    },

    componentWillReceiveProps: function(nextProps) {
        var prevProps = this.props;

        if (!_.isEqual(nextProps.options, prevProps.options)) {

            // Regenerate items
            this.setState({
                items: this.itemsFromProps(nextProps)
            });

        } else if (nextProps.layout !== prevProps.layout || 
                   nextProps.padding !== prevProps.padding ||
                   nextProps.disabled !== prevProps.disabled ||
                   !_.isEqual(nextProps.constraints, prevProps.constraints)) {

            // Clear item measurements
            this.setState({
                items: this.clearItemMeasurements(this.state.items)
            });
        }
    },

    componentDidUpdate: function(prevProps) {
        // Measure items if their dimensions have been reset
        if (this.state.items.length && !this.state.items[0].width) {
            this.measureItems();
        }
    },

    itemsFromProps: function(props) {
        var type = props.disabled ? DISABLED : STATIC;
        return _.map(props.options, function(option, i) {
            return {
                option: option,
                key: i,
                type: type,
                endPosition: {},
                width: 0,
                height: 0
            };
        });
    },

    clearItemMeasurements: function(items) {
        return _.map(items, function(item) {
            return _.extend(item, {
                width: 0,
                height: 0
            });
        });
    },

    measureItems: function() {
        // Measure all items and cache what their dimensions should be, taking
        // into account constraints and the current layout. This allows syncing
        // widths and heights for pretty rows/columns. Note that dimensions are
        // explictly set on Draggables - this prevents them from changing size
        // or shape while being dragged.

        var items = _.clone(this.state.items);
        var $items = _.map(items, function(item) {
            return $(this.refs[item.key].getDOMNode());
        }, this);

        var widths = _.invoke($items, "outerWidth");
        var heights = _.invoke($items, "outerHeight");

        var constraints = this.props.constraints;
        var layout = this.props.layout;

        var syncWidth;
        if (constraints.width) {
            // Items must be at least as wide as the specified constraint
            syncWidth = _.max(widths.concat(constraints.width));
        } else if (layout === VERTICAL) {
            // Sync widths to get a clean column
            syncWidth = _.max(widths);
        }

        var syncHeight;
        if (constraints.height) {
            // Items must be at least as high as the specified constraint
            syncHeight = _.max(heights.concat(constraints.height));
        } else if (layout === HORIZONTAL) {
            // Sync widths to get a clean row
            syncHeight = _.max(heights);
        }

        items = _.map(items, function(item, i) {
            item.width = syncWidth || widths[i];
            item.height = syncHeight || heights[i];
            return item;
        });

        this.setState({items: items}, function() {
            this.props.onMeasure({widths: widths, heights: heights});
        }.bind(this));
    },

    remeasureItems: _.debounce(function() {
        this.setState({
            // Clear item measurements
            items: this.clearItemMeasurements(this.state.items)
        }, this.measureItems);
    }, 20),

    render: function() {
        var className = [PREFIX, "layout-" + this.props.layout].join(" ");
        var cards = [];

        className += this.props.padding ? "" : " unpadded";

        _.each(this.state.items, function(item, i, items) {
            var isLast = (i === items.length - 1);
            var isStatic = (item.type === STATIC || item.type === DISABLED);
            var margin;

            if (this.props.layout === HORIZONTAL) {
                margin = "0 " + this.props.margin + "px 0 0"; // right
            } else if (this.props.layout === VERTICAL) {
                margin = "0 0 " + this.props.margin + "px 0"; // bottom
            }

            cards.push(
                Draggable(
                    {content:item.option,
                    key:item.key,
                    type:item.type,
                    ref:item.key,
                    width:item.width,
                    height:item.height,
                    margin:isLast && isStatic ? 0 : margin,
                    endPosition:item.endPosition,
                    onRender:this.remeasureItems,
                    onMouseDown:_.bind(this.onMouseDown, this, item.key),
                    onMouseMove:_.bind(this.onMouseMove, this, item.key),
                    onMouseUp:_.bind(this.onMouseUp, this, item.key),
                    onAnimationEnd:_.bind(this.onAnimationEnd, this, 
                        item.key)} )
            );

            if (item.type === DRAGGING || item.type === ANIMATING) {
                cards.push(
                    Placeholder(
                        {key:"placeholder_" + item.key,
                        ref:"placeholder_" + item.key,
                        width:item.width,
                        height:item.height,
                        margin:isLast ? 0 : margin} )
                );
            }
        }, this);

        return React.DOM.ul( {className:className}, 
            cards
        );
    },

    onMouseDown: function(key) {
        // Static -> Dragging
        var items = _.map(this.state.items, function(item) {
            if (item.key === key) {
                item.type = DRAGGING;
            }
            return item;
        });

        this.setState({items: items});
     },

    onMouseMove: function(key) {
        // Dragging: Rearrange items based on draggable's position
        var $draggable = $(this.refs[key].getDOMNode());
        var $sortable = $(this.getDOMNode());
        var items = _.clone(this.state.items);
        var item = _.findWhere(this.state.items, {key: key});
        var margin = this.props.margin;
        var currentIndex = _.indexOf(items, item);
        var newIndex = 0;

        items.splice(currentIndex, 1);

        if (this.props.layout === HORIZONTAL) {
            var midWidth = $draggable.offset().left - $sortable.offset().left;
            var sumWidth = 0;
            var cardWidth;

            _.each(items, function(item) {
                cardWidth = item.width;
                if (midWidth > sumWidth + cardWidth / 2) {
                    newIndex += 1;
                }
                sumWidth += cardWidth + margin;
            });

        } else {
            var midHeight = $draggable.offset().top - $sortable.offset().top;
            var sumHeight = 0;
            var cardHeight;

            _.each(items, function(item) {
                cardHeight = item.height;
                if (midHeight > sumHeight + cardHeight / 2) {
                    newIndex += 1;
                }
                sumHeight += cardHeight + margin;
            });
        }

        if (newIndex !== currentIndex) {
            items.splice(newIndex, 0, item);
            this.setState({items: items});
        }
    },

    onMouseUp: function(key) {
        // Dragging -> Animating
        var items = _.map(this.state.items, function(item) {
            if (item.key === key) {
                item.type = ANIMATING;
                item.endPosition = $(this.refs["placeholder_" + key]
                                    .getDOMNode()).position();
            }
            return item;
        }, this);

        this.setState({items: items});
        // HACK: We need to know *that* the widget changed, but currently it's
        // not set up in a nice way to tell us *how* it changed, since the
        // permutation of the items is stored in state.
        this.props.onChange({});
    },

    onAnimationEnd: function(key) {
        // Animating -> Static
        var items = _.map(this.state.items, function(item) {
            if (item.key === key) {
                item.type = STATIC;
            }
            return item;
        });

        this.setState({items: items});
    },

    getOptions: function() {
        return _.pluck(this.state.items, "option");
    }
});

module.exports = Sortable;

})(Perseus);

},{"../core.js":15,"../renderer.jsx":36}],13:[function(require,module,exports){
/** @jsx React.DOM */

var textWidthCache = {};
function getTextWidth(text) {
    if (!textWidthCache[text]) {
        // Hacky way to guess the width of an input box
        var $test = $("<span>").text(text).appendTo("body");
        textWidthCache[text] = $test.width() + 5;
        $test.remove();
    }
    return textWidthCache[text];
}


var TextListEditor = React.createClass({displayName: 'TextListEditor',
    propTypes: {
        options: React.PropTypes.array,
        layout: React.PropTypes.string,
        onChange: React.PropTypes.func.isRequired
    },

    getDefaultProps: function() {
        return {
            options: [],
            layout: "horizontal"
        };
    },

    getInitialState: function() {
        return {
            items: this.props.options.concat("")
        };
    },

    componentWillReceiveProps: function(nextProps) {
        this.setState({
            items: nextProps.options.concat("")
        });
    },

    render: function() {
        var className = [
            "perseus-text-list-editor",
            "ui-helper-clearfix",
            "layout-" + this.props.layout
        ].join(" ");

        var inputs = _.map(this.state.items, function(item, i) {
            return React.DOM.li( {key:i}, 
                React.DOM.input(
                    {ref:"input_" + i,
                    type:"text",
                    value:item,
                    onChange:this.onChange.bind(this, i),
                    onKeyDown:this.onKeyDown.bind(this, i),
                    style:{width: getTextWidth(item)}} )
            );
        }, this);

        return React.DOM.ul( {className:className}, inputs);
    },

    onChange: function(index, event) {
        var items = _.clone(this.state.items);
        items[index] = event.target.value;

        if (index === items.length - 1) {
            items = items.concat("");
        }

        this.setState({items: items});
        this.props.onChange(_.compact(items));
    },

    onKeyDown: function(index, event) {
        var which = event.nativeEvent.keyCode;

        // Backspace deletes an empty input...
        if (which === 8 /* backspace */ && this.state.items[index] === "") {
            event.preventDefault();

            var items = _.clone(this.state.items);
            var focusIndex = (index === 0) ? 0 : index - 1;

            if (index === items.length - 1 &&
                    (index === 0 || items[focusIndex] !== "")) {
                // ...except for the last one, iff it is the only empty
                // input at the end.
                this.refs["input_" + focusIndex].getDOMNode().focus();
            } else {
                items.splice(index, 1);
                this.setState({items: items}, function() {
                    this.refs["input_" + focusIndex].getDOMNode().focus();
                });                
            }

        // Deleting the last character in the second-to-last input removes it
        } else if (which === 8 /* backspace */ &&
                this.state.items[index].length === 1 &&
                index === this.state.items.length - 2) {
            event.preventDefault();

            var items = _.clone(this.state.items);
            items.splice(index, 1);
            this.setState({items: items});
            this.props.onChange(_.compact(items));

        // Enter adds an option below the current one...
        } else if (which === 13 /* enter */) {
            event.preventDefault();

            var items = _.clone(this.state.items);
            var focusIndex = index + 1;

            if (index === items.length - 2) {
                // ...unless the empty input is just below.
                this.refs["input_" + focusIndex].getDOMNode().focus();
            } else {
                items.splice(focusIndex, 0, "");
                this.setState({items: items}, function() {
                    this.refs["input_" + focusIndex].getDOMNode().focus();
                });
            }
        }
    }
});

module.exports = TextListEditor;

},{}],14:[function(require,module,exports){
/** @jsx React.DOM */

require("../core.js");
var Util = require("../util.js");
var knumber = KhanUtil.knumber;

/* Your go-to input box for numbers and number-like strings
 *
 * Features:
 * - Text Parsing: intelligently parses fractions (1/2), constants (pi), etc.
 *
 * - Validation: uses the owner's checkValidity function
 *
 * - Key Controls: Press up to increment, down to decrement. Stays in-bounds.
 *
 * TODO(brianmerlob): make it increment/decrement better; if invalid make it
 * go to the closest valid number if pressed in the relevant direction.
 * If it is a fraction or decimal, increment by the step size if provided
 *
 */
var ValidatedNumberInput = React.createClass({displayName: 'ValidatedNumberInput',
    propTypes: {
        value: React.PropTypes.number,
        placeholder: React.PropTypes.any,
        onChange: React.PropTypes.func.isRequired,
        checkValidity: React.PropTypes.func,
    },

    getDefaultProps: function() {
        return {
            value: "",
            placeholder: null,
            checkValidity: function(){return true;}
        };
    },

    render: function() {
        cx = React.addons.classSet;

        var classes = cx({
            "validated-number-input": true,
            "invalid-input": !this._checkValidity(this.props.value),
            "mini": this.props.size === "mini",
            "small": this.props.size === "small",
            "normal": this.props.size === "normal",
        });

        var value = this.props.value == null ? "" : this.props.value;

        var input = React.DOM.input(_.extend({}, this.props, {
            className: classes,
            type: "text",
            ref: "input",
            onChange: this._handleChange,
            onBlur: this._handleBlur,
            onKeyPress: this._handleBlur,
            onKeyDown: this._onKeyDown,
            onInvalid: this._onInvalid,
            defaultValue: String(value),
            value: undefined
        }));

        if (this.props.label) {
            return React.DOM.label(null, this.props.label + " ", " ", input);
        } else {
            return input;
        }
    },

    componentDidUpdate: function(prevProps) {
        if (!knumber.equal(this.getValue(), this.props.value)) {
            $(this.refs["input"].getDOMNode()).val(this.props.value);
        }
    },

    // Return the current numeric "value" of this input (or null)
    getValue: function() {
        var value = this.refs["input"].getDOMNode().value;

        if (value === "") {
            if (_.isFinite(this.props.placeholder)) {
                return +this.props.placeholder;
            } else {
                return null;
            }
        } else {
            var result = Util.firstNumericalParse(value);
            if (_.isFinite(result)) {
                return result;
            } else {
                return this.props.value;
            }
        }
    },

    /* Set text input focus to this input */
    focus: function() {
        this.refs["input"].getDOMNode().focus();
    },

    _checkValidity: function(value) {
        if(value === "" || value == null) {
            return true;
        }

        var val = Util.firstNumericalParse(value);
        var checkValidity = this.props.checkValidity;

        return checkValidity(val) && _.isFinite(val);
    },

    _handleChange: function(e) {
        this.props.onChange(this.getValue());
    },

    _onKeyDown: function(e) {
        if (!_.contains(["ArrowUp", "ArrowDown"], e.key)) {
            return;
        }

        var val = this.getValue();
        if (val !== Math.floor(val)) {
            return; // bail if not an integer
        }

        if (e.key === "ArrowUp") {
            val = val + 1;
        } else if (e.key === "ArrowDown") {
            val = val - 1;
        }

        if (this._checkValidity(val)) {
            this.props.onChange(val);
        }
    },
});

module.exports = ValidatedNumberInput;

},{"../core.js":15,"../util.js":38}],15:[function(require,module,exports){
(function(undefined) {

var Util = require("./util.js");

var Perseus = window.Perseus = {
    Util: Util
};

Perseus.init = function(options) {
    _.defaults(options, {
        // Pass skipMathJax: true if MathJax is already loaded and configured.
        skipMathJax: false,
        // A function which takes a file object (guaranteed to be an image) and
        // a callback, then calls the callback with the url where the image
        // will be hosted. Image drag and drop is disabled when imageUploader
        // is null.
        imageUploader: null
    });

    var deferred = $.Deferred();

    markedReact.setOptions({
        sanitize: true,
        paragraphFn: function(text) {
            return React.DOM.div({className: 'paragraph'}, text);
        }
    });

    if (options.skipMathJax) {
        deferred.resolve();
    } else {
        MathJax.Hub.Config({
            messageStyle: "none",
            skipStartupTypeset: "none",
            "HTML-CSS": {
                availableFonts: ["TeX"],
                imageFont: null,
                scale: 100,
                showMathMenu: false
            }
        });

        MathJax.Hub.Configured();
        MathJax.Hub.Queue(deferred.resolve);
    }

    Perseus.imageUploader = options.imageUploader;

    return deferred;
};

})();

},{"./util.js":38}],16:[function(require,module,exports){
/** @jsx React.DOM */

// Responsible for combining the text diffs from text-diff and the widget
// diffs from widget-differ.

(function(Perseus) {

var WidgetDiff = require("./widget-diff.jsx");
var TextDiff = require("./text-diff.jsx");

// Deeply look up a property in an object,
// -> getPath(obj, ["a", "b", "c"]) === obj["a"]["b"]["c"]
var getPath = function(obj, path, defaultValue) {
    var returningDefault = false;
    var result = _(path).reduce(function(obj, key) {
        if (returningDefault || !obj.hasOwnProperty(key)) {
            returningDefault = true;
            return defaultValue;
        }
        return obj[key];
    }, obj);
    return result;
};

var widgetsIn = function(item) {
    var question = item.question || {};
    var widgets = question.widgets || {};
    return _.keys(widgets);
};

var isWidget = function(obj)  {return _.isObject(obj) && !("content" in obj);};

var RevisionDiff = React.createClass({displayName: 'RevisionDiff',
    propTypes: {
        beforeItem: React.PropTypes.object,
        afterItem: React.PropTypes.object
    },

    render: function() {
        var before = this.props.beforeItem;
        var after = this.props.afterItem;
        // Not going to handle inserting hints in the middle so well, but
        // that's pretty complicated to handle nicely.
        // This will do for now.
        var hintCount = Math.max(before.hints.length, after.hints.length);
        var widgets = _.union(widgetsIn(before), widgetsIn(after));
        var sections = [
            {
                title: "Question Area",
                path: ["question"]
            },
            {
                title: "Answer Area",
                path: ["answerArea", "options"]
            }
        ].concat(
            _.times(hintCount, function(n) {
                return {
                    title: "Hint #" + (n + 1),
                    path: ["hints", n]
                };
            })
        ).concat(
            _.map(widgets, function(widget) {
                return {
                    title: widget,
                    path: ["question", "widgets", widget, "options"]
                };
            })
        );

        var result = [];

        _(sections).each(function(section) {
            var path = section.path;
            var beforeValue = getPath(before, path, "");
            var afterValue = getPath(after, path, "");
            var displayedDiff;
            if (isWidget(beforeValue) && isWidget(afterValue)) {
                displayedDiff = WidgetDiff(
                    {key:section.title,
                    title:section.title,
                    before:beforeValue,
                    after:afterValue} );
            } else {
                displayedDiff = TextDiff(
                    {key:section.title,
                    title:section.title,
                    before:beforeValue.content,
                    after:afterValue.content} );
            }
            result.push(React.DOM.div(null, 
                React.DOM.div( {className:"diff-header"}, section.title),
                React.DOM.div( {className:"diff-header"}, section.title),
                React.DOM.div( {className:"diff-body ui-helper-clearfix"}, 
                    displayedDiff
                )
            ));
        });

        return React.DOM.div(null, result);
    }
});

Perseus.RevisionDiff = RevisionDiff;

})(Perseus);

},{"./text-diff.jsx":18,"./widget-diff.jsx":20}],17:[function(require,module,exports){
/** @jsx React.DOM */// Split a word-wise diff generated by jsdiff into multiple lines, for the
// purpose of breaking up the diffs into lines, so that modified lines can be
// faintly highlighted

var splitDiff = function(diffEntries) {
    var lines = [];
    var currentLine = [];
    _.each(diffEntries, function(entry)  {
        var values = entry.value.split("\n");
        _.each(values, function(value, i)  {
            var isNewline = i > 0;
            if (isNewline) {
                lines.push(currentLine);
                currentLine = [];
            }
            var newEntry = _.extend({}, entry, { value: value });
            currentLine.push(newEntry);
        });
    });

    if (currentLine.length) {
        lines.push(currentLine);
    }
    return lines;
};


module.exports = splitDiff;

},{}],18:[function(require,module,exports){
/** @jsx React.DOM */

var diff = require("../../lib/jsdiff");
var splitDiff = require("./split-diff.jsx");

var cx = React.addons.classSet;

var BEFORE = "before";
var AFTER = "after";

var classFor = function(entry, ifAdded, ifRemoved) {
    if (entry.added) {
        return ifAdded;
    } else if (entry.removed) {
        return ifRemoved;
    } else {
        return "";
    }
};

var TextDiff = React.createClass({displayName: 'TextDiff',
    propTypes: {
        before: React.PropTypes.string.isRequired,
        after: React.PropTypes.string.isRequired,
        title: React.PropTypes.string.isRequired
    },

    getInitialState: function() {
        return {
            collapsed: this.props.before === this.props.after
        };
    },

    componentWillReceiveProps: function(nextProps) {
        this.setState({
            collapsed: nextProps.before === nextProps.after
        });
    },

    render: function() {
        var diffed = diff.diffWords(this.props.before, this.props.after);

        var lines = splitDiff(diffed);

        var renderedLines = _.map(lines, function(line)  {
            var contents = {};

            contents.before = _(line).map(function(entry, i) {
                var className = classFor(entry, "not-present", "removed dark");
                return React.DOM.span(
                    {key:i,
                    className:className}, entry.value);
            });

            contents.after = _(line).map(function(entry, i) {
                var className = classFor(entry, "added dark", "not-present");
                return React.DOM.span(
                    {key:i,
                    className:className}, entry.value);
            });
            return contents;
        });

        var className = cx({
            "diff-row": true,
            "collapsed": this.state.collapsed
        });

        return React.DOM.div(null, 
            React.DOM.div( {className:"ui-helper-clearfix"}, 
                _.map([BEFORE, AFTER], function(side)  {
                    return React.DOM.div( {className:"diff-row " + side} , 
                        !this.state.collapsed &&
                            _.map(renderedLines, function(line)  {
                                var changed = line[side].length > 1;
                                var lineClass = cx({
                                    "diff-line": true,
                                    "added": side === AFTER && changed,
                                    "removed": side === BEFORE && changed
                                });
                                return React.DOM.div( {className:lineClass} , 
                                    line[side]
                                );
                            })
                    );
                }.bind(this))
            ),
            _.map([BEFORE, AFTER], function(side)  {
                return React.DOM.div( {className:className + " " + side,
                    onClick:this.handleExpand} , 
                    this.state.collapsed &&
                    React.DOM.span(null, 
                        React.DOM.span( {className:"expand-button"} , 
                            " ","[ show unmodified ]"
                        )
                    )
                );
            }.bind(this))
        );
    },

    handleExpand: function() {
        this.setState({ collapsed: false });
    }
});

module.exports = TextDiff;

},{"../../lib/jsdiff":1,"./split-diff.jsx":17}],19:[function(require,module,exports){
/** @jsx React.DOM */var UNCHANGED = "unchanged";
var CHANGED = "changed";
var ADDED = "added";
var REMOVED = "removed";

// For values which do not have further values nested within them (strings,
// numbers, and booleans)
var valueEntry = function(before, after, key) {
    var status;
    if (before === after) {
        status = UNCHANGED;
    } else if (before === undefined) {
        status = ADDED;
    } else if (after === undefined) {
        status = REMOVED;
    } else {
        status = CHANGED;
    }

    return {
        after: JSON.stringify(after),
        before: JSON.stringify(before),
        children: [],
        key: key,
        status: status
    };
};

// For values which require a more granular diff (objects and arrays)
var objectEntry = function(before, after, key) {
    var beforeKeys = (_.isObject(before)) ? _(before).keys() : [];
    var afterKeys = (_.isObject(after)) ? _(after).keys() : [];
    var keys = _.union(beforeKeys, afterKeys);

    var children = _.map(keys, function(key) {
        return performDiff((before || {})[key], (after || {})[key], key);
    });

    var status;
    if (before === undefined) {
        status = ADDED;
    } else if (after === undefined) {
        status = REMOVED;
    } else {
        var changed = _.any(children, function(child) {
            return child.status !== UNCHANGED;
        });
        status = changed ? CHANGED : UNCHANGED;
    }

    return {
        after: "",
        before: "",
        children: children,
        key: key,
        status: status
    };
};

var performDiff = function(before, after, /* optional */ key) {
    if (typeof before === "object" || typeof after === "object") {
        return objectEntry(before, after, key);
    } else {
        return valueEntry(before, after, key);
    }
};

module.exports = performDiff;

},{}],20:[function(require,module,exports){
/** @jsx React.DOM */

var cx = React.addons.classSet;
var performDiff = require("./widget-diff-performer.jsx");

var indentationFromDepth = function(depth) {
    return (depth - 1) * 20;
};

var BEFORE = "before";
var AFTER = "after";

var UNCHANGED = "unchanged";

var DiffSide = React.createClass({displayName: 'DiffSide',
    propTypes: {
        side: React.PropTypes.oneOf([BEFORE, AFTER]).isRequired,
        className: React.PropTypes.string.isRequired,
        showKey: React.PropTypes.bool.isRequired,
        propKey: React.PropTypes.string.isRequired,
        value: React.PropTypes.string,
        depth: React.PropTypes.number.isRequired
    },

    render: function() {
        var className = this.props.className + " " + cx({
            "diff-row": true,
            before: this.props.side === BEFORE,
            after: this.props.side === AFTER
        });
        return React.DOM.div( {className:className} , 
            React.DOM.div( {style:{
                paddingLeft: indentationFromDepth(this.props.depth)
            }} , 
                this.props.showKey && this.props.propKey + ": ",
                React.DOM.span( {className:"inner-value dark " + this.props.className} , 
                    this.props.value
                )
            )
        );
    }
});

var CollapsedRow = React.createClass({displayName: 'CollapsedRow',
    propTypes: {
        depth: React.PropTypes.number,
        onClick: React.PropTypes.func.isRequired
    },

    getDefaultProps: function() {
        return {
            depth: 0
        };
    },

    render: function() {
        var self = this;
        return React.DOM.div( {onClick:self.props.onClick}, 
            _.map([BEFORE, AFTER], function(side) {
                return React.DOM.div( {className:"diff-row collapsed " + side,
                    key:side} , 
                        React.DOM.div( {style:{
                            paddingLeft: indentationFromDepth(self.props.depth)
                        }}, 
                        React.DOM.span(null,  " [ show unmodified ] " )
                    )
                );
            })
        );
    }
});

// Component representing a single property that may be nested.
var DiffEntry = React.createClass({displayName: 'DiffEntry',
    propTypes: {
        entry: React.PropTypes.shape({
            key: React.PropTypes.string,
            children: React.PropTypes.array,
            before: React.PropTypes.string,
            after: React.PropTypes.string
        }),
        depth: React.PropTypes.number,
        expanded: React.PropTypes.bool
    },

    getDefaultProps: function() {
        return {
            depth: 0
        };
    },

    getInitialState: function() {
        return {
            expanded: this.props.expanded
        };
    },

    render: function() {
        var entry = this.props.entry;
        var propertyDeleted = entry.status === "removed";
        var propertyAdded   = entry.status === "added";
        var propertyChanged = entry.status === "changed";

        var hasChildren = entry.children.length > 0;

        var leftClass = cx({
            "removed": (propertyDeleted || propertyChanged) && !hasChildren,
            "dark": propertyDeleted,
            "blank-space": propertyAdded
        });

        var rightClass = cx({
            "added": (propertyAdded || propertyChanged) && !hasChildren,
            "dark": propertyAdded,
            "blank-space": propertyDeleted
        });

        var shownChildren;
        if (this.state.expanded) {
            shownChildren = entry.children;
        } else {
            shownChildren = _(entry.children).select(function(child) {
                return child.status !== UNCHANGED;
            });
        }

        var collapsed = shownChildren.length < entry.children.length;

        // don't hide just one entry
        if (entry.children.length === shownChildren.length + 1) {
            shownChildren = entry.children;
            collapsed = false;
        }

        var self = this;
        return React.DOM.div(null, 
            entry.key && React.DOM.div(null, 
            DiffSide(
                {side:BEFORE,
                className:leftClass,
                depth:this.props.depth,
                propKey:entry.key,
                showKey:!propertyAdded,
                value:entry.before} ),
            DiffSide(
                {side:AFTER,
                className:rightClass,
                depth:this.props.depth,
                propKey:entry.key,
                showKey:!propertyDeleted,
                value:entry.after} )
            ),
            _.map(shownChildren, function(child) {
                return DiffEntry(
                    {key:child.key,
                    depth:self.props.depth + 1,
                    entry:child,
                    expanded:self.state.expanded} );
            }),
            collapsed &&
                CollapsedRow(
                    {depth:this.props.depth + 1,
                    onClick:this.expand} )
        );
    },

    expand: function() {
        this.setState({ expanded: true });
    }
});

var WidgetDiff = React.createClass({displayName: 'WidgetDiff',
    propTypes: {
        before: React.PropTypes.shape({
            options: React.PropTypes.object
        }).isRequired,
        after: React.PropTypes.shape({
            options: React.PropTypes.object
        }).isRequired,
        title: React.PropTypes.string.isRequired
    },

    render: function() {
        var diff = performDiff(this.props.before,
                               this.props.after);
        return React.DOM.div(null, 
            React.DOM.div( {className:"ui-helper-clearfix"}, 
                DiffEntry( {entry:diff} )
            )
        );
    }
});

module.exports = WidgetDiff;

},{"./widget-diff-performer.jsx":19}],21:[function(require,module,exports){
/** @jsx React.DOM */

require("./core.js");
require("./item-editor.jsx");
require("./item-renderer.jsx");
require("./hint-editor.jsx");
require("./diffs/revision-diff.jsx");

var BlurInput = require("./components/blur-input.jsx");
var PropCheckBox = require("./components/prop-check-box.jsx");

var ItemEditor = Perseus.ItemEditor;
var ItemRenderer = Perseus.ItemRenderer;
var CombinedHintsEditor = Perseus.CombinedHintsEditor;

var JsonEditor = React.createClass({displayName: 'JsonEditor',

    getInitialState: function() {
        return {
            currentValue: JSON.stringify(this.props.value, null, 4),
            valid: true
        };
    },

    componentWillReceiveProps: function(nextProps) {
        var shouldReplaceContent = !this.state.valid ||
            !_.isEqual(
                nextProps.value,
                JSON.parse(this.state.currentValue)
            );

        if (shouldReplaceContent) {
            this.setState(this.getInitialState());
        }
    },

    render: function() {
        var classes = "perseus-json-editor " +
            (this.state.valid ? "valid" : "invalid");

        return React.DOM.textarea(
            {className:classes,
            value:this.state.currentValue,
            onChange:this.handleChange,
            onKeyDown:this.handleKeyDown,
            onBlur:this.handleBlur} );
    },

    handleKeyDown: function(e) {
        // This handler allows the tab character to be entered by pressing
        // tab, instead of jumping to the next (non-existant) field
        if (e.key === "Tab") {
            var cursorPos = e.target.selectionStart;
            var v = e.target.value;
            var textBefore = v.substring(0, cursorPos);
            var textAfter = v.substring(cursorPos, v.length);
            e.target.value = textBefore+ "    " +textAfter;
            e.target.selectionStart = textBefore.length + 4;
            e.target.selectionEnd = textBefore.length + 4;

            e.preventDefault();
            this.handleChange(e);
        }
    },

    handleChange: function(e) {
        var nextString = e.target.value;
        try {
            var json = JSON.parse(nextString);
            // Some extra handling to allow copy-pasting from /api/vi
            if (_.isString(json)) {
                json = JSON.parse(json);
            }
            // This callback unfortunately causes multiple renders,
            // but seems to be necessary to avoid componentWillReceiveProps
            // being called before setState has gone through
            this.setState({
                currentValue: nextString,
                valid: true
            }, function() {
                this.props.onChange(json);
            });
        } catch (ex) {
            this.setState({
                currentValue: nextString,
                valid: false
            });
        }
    },

    handleBlur: function(e) {
        var nextString = e.target.value;
        try {
            var json = JSON.parse(nextString);
            // Some extra handling to allow copy-pasting from /api/vi
            if (_.isString(json)) {
                json = JSON.parse(json);
            }
            // This callback unfortunately causes multiple renders,
            // but seems to be necessary to avoid componentWillReceiveProps
            // being called before setState has gone through
            this.setState({
                currentValue: JSON.stringify(json, null, 4),
                valid: true
            }, function() {
                this.props.onChange(json);
            });
        } catch (ex) {
            this.setState({
                currentValue: JSON.stringify(this.props.value, null, 4),
                valid: true
            });
        }
    }
});

Perseus.EditorPage = React.createClass({displayName: 'EditorPage',
    getDefaultProps: function() {
        return {
            developerMode: false,
            jsonMode: false
        };
    },

    getInitialState: function() {
        return {
            json: {
                question: this.props.question,
                answer: this.props.answerArea,
                hints: this.props.hints
            }
        };
    },

    render: function() {

        return React.DOM.div( {id:"perseus", className:"framework-perseus"}, 
            this.props.developerMode &&
                React.DOM.div(null, 
                    React.DOM.label(null, 
                        ' ',"Developer JSON Mode:",' ',
                        React.DOM.input( {type:"checkbox",
                            checked:this.props.jsonMode,
                            onChange:this.toggleJsonMode} )
                    )
                ),
            

            this.props.developerMode && this.props.jsonMode &&
                React.DOM.div(null, 
                    JsonEditor(
                        {multiLine:true,
                        value:this.state.json,
                        onChange:this.changeJSON} )
                ),
            

            (!this.props.developerMode || !this.props.jsonMode) &&
                ItemEditor(
                    {ref:"itemEditor",
                    rendererOnly:this.props.jsonMode,
                    question:this.props.question,
                    answerArea:this.props.answerArea,
                    onChange:this.handleChange} ),
            

            (!this.props.developerMode || !this.props.jsonMode) &&
                CombinedHintsEditor(
                    {ref:"hintsEditor",
                    hints:this.props.hints,
                    onChange:this.handleChange} )
            
        );

    },

    toggleJsonMode: function() {
        this.setState({
            json: this.toJSON(true)
        }, function() {
            this.props.onChange({
                jsonMode: !this.props.jsonMode
            });
        });
    },

    componentDidMount: function() {
        this.rendererMountNode = document.createElement("div");
        this.updateRenderer();
    },

    componentDidUpdate: function() {
        this.updateRenderer();
    },

    updateRenderer: function(cb) {
        if (this.props.jsonMode) {
            return;
        }
        var rendererConfig = _({
            item: this.toJSON(true),
            initialHintsVisible: 0  /* none; to be displayed below */
        }).extend(
            _(this.props).pick("workAreaSelector",
                               "solutionAreaSelector",
                               "hintsAreaSelector",
                               "problemNum")
        );

        this.renderer = React.renderComponent(
            Perseus.ItemRenderer(rendererConfig),
            this.rendererMountNode,
            cb);
    },

    handleChange: function(toChange, cb) {
        var newProps = _(this.props).pick("question", "hints", "answerArea");
        _(newProps).extend(toChange);
        this.props.onChange(newProps, cb);
    },

    changeJSON: function(newJson) {
        this.setState({
            json: newJson,
        });
        this.props.onChange(newJson);
    },

    scorePreview: function() {
        if (this.renderer) {
            return this.renderer.scoreInput();
        } else {
            return null;
        }
    },

    toJSON: function(skipValidation) {
        if (this.props.jsonMode) {
            return this.state.json;
        } else {
            return _.extend(this.refs.itemEditor.toJSON(skipValidation), {
                hints: this.refs.hintsEditor.toJSON()
            });
        }
    }

});

/* Renders an EditorPage as a non-controlled component.
 *
 * Normally the parent of EditorPage must pass it an onChange callback and then
 * respond to any changes by modifying the EditorPage props to reflect those
 * changes. With StatefulEditorPage changes are stored in state so you can
 * query them with toJSON.
 */
Perseus.StatefulEditorPage = React.createClass({displayName: 'StatefulEditorPage',
    render: function() {
        return Perseus.EditorPage(this.state);
    },
    getInitialState: function() {
        return _({}).extend(this.props, {
            onChange: this.handleChange,
            ref: "editor"
        });
    },
    // getInitialState isn't called if the react component is re-rendered
    // in-place on the dom, in which case this is called instead, so we
    // need to update the state here.
    // (This component is currently re-rendered by the "Add image" button.)
    componentWillReceiveProps: function(nextProps) {
        this.setState(nextProps);
    },
    toJSON: function() {
        return this.refs.editor.toJSON();
    },
    handleChange: function(newState, cb) {
        this.setState(newState, cb);
    },
    scorePreview: function() {
        return this.refs.editor.scorePreview();
    }
});



},{"./components/blur-input.jsx":4,"./components/prop-check-box.jsx":10,"./core.js":15,"./diffs/revision-diff.jsx":16,"./hint-editor.jsx":23,"./item-editor.jsx":31,"./item-renderer.jsx":32}],22:[function(require,module,exports){
/** @jsx React.DOM */
(function(Perseus) {

require("./core.js");
var Util = require("./util.js");

var Widgets = require("./widgets.js");
var PropCheckBox = require("./components/prop-check-box.jsx");

// like [[snowman input-number 1]]
var rWidgetSplit = /(\[\[\u2603 [a-z-]+ [0-9]+\]\])/g;

/* This component makes its children a drag target. Example:
 *
 *     <DragTarget onDrop={this.handleDrop}>Drag to me</DragTarget>
 *
 *     ...
 *
 *     handleDrop: function(e) {
 *         this.addImages(e.nativeEvent.dataTransfer.files);
 *     }
 *
 * Now "Drag to me" will be a drag target - when something is dragged over it,
 * the element will become partially transparent as a visual indicator that
 * it's a target.
 */
// TODO(joel) - indicate before the hover is over the target that it's possible
// to drag into the target. This would (I think) require a high level handler -
// like on Perseus itself, waiting for onDragEnter, then passing down the
// event. Sounds like a pain. Possible workaround - create a div covering the
// entire page...
//
// Other extensions:
// * custom styles for global drag and dragOver
// * only respond to certain types of drags (only images for instance)!
var DragTarget = React.createClass({displayName: 'DragTarget',
    propTypes: {
        onDrop: React.PropTypes.func.isRequired,
        component: React.PropTypes.component,
        shouldDragHighlight: React.PropTypes.func
    },
    render: function() {
        // This is the only property of the returned component we need to
        // calculate here because it will be overwritten by transferPropsTo.
        var opacity = this.state.dragHover ? { "opacity": 0.3 } : {};

        var component = this.props.component;
        return this.transferPropsTo(
            component( {style:opacity,
                       onDrop:this.handleDrop,
                       onDragEnd:this.handleDragEnd,
                       onDragOver:this.handleDragOver,
                       onDragEnter:this.handleDragEnter,
                       onDragLeave:this.handleDragLeave}, 
                this.props.children
            )
        );
    },
    getInitialState: function() {
        return { dragHover: false };
    },
    getDefaultProps: function() {
        return {
            component: React.DOM.div,
            shouldDragHighlight: function() { return true; }
        };
    },
    handleDrop: function(e) {
        e.stopPropagation();
        e.preventDefault();
        this.setState({ dragHover: false });
        this.props.onDrop(e);
    },
    handleDragEnd: function() {
        this.setState({ dragHover: false });
    },
    handleDragOver: function(e) {
        e.preventDefault();
    },
    handleDragLeave: function() {
        this.setState({ dragHover: false });
    },
    handleDragEnter: function(e) {
        this.setState({ dragHover: this.props.shouldDragHighlight(e) });
    }
});

var WidgetSelect = React.createClass({displayName: 'WidgetSelect',
    handleChange: function(e) {
        var widgetType = e.target.value;
        if (widgetType === "") {
            // TODO(alpert): Not sure if change will trigger here
            // but might as well be safe
            return;
        }
        e.target.value = "";
        if (this.props.onChange) {
            this.props.onChange(widgetType);
        }
    },
    shouldComponentUpdate: function() {
        return false;
    },
    render: function() {
        return React.DOM.select( {onChange:this.handleChange}, 
            React.DOM.option( {value:""}, "Add a widget","\u2026"),
            React.DOM.option( {disabled:true}, "--"),
            React.DOM.option( {value:"input-number"}, 
                    "Text input (number)"),
            React.DOM.option( {value:"expression"}, 
                    "Expression / Equation"),
            React.DOM.option( {value:"radio"}, 
                    "Multiple choice"),
            React.DOM.option( {value:"interactive-graph"}, 
                    "Interactive graph"),
            React.DOM.option( {value:"number-line"}, 
                    "Number line"),
            React.DOM.option( {value:"categorization"}, 
                    "Categorization"),
            React.DOM.option( {value:"plotter"}, 
                    "Plotter"),
            React.DOM.option( {value:"table"}, 
                    "Table of values"),
            React.DOM.option( {value:"dropdown"}, 
                    "Drop down"),
            React.DOM.option( {value:"orderer"}, 
                    "Orderer"),
            React.DOM.option( {value:"measurer"}, 
                    "Measurer"),
            React.DOM.option( {value:"transformer"}, 
                    "Transformer"),
            React.DOM.option( {value:"matcher"}, 
                    "Two column matcher"),
            React.DOM.option( {value:"sorter"}, 
                    "Sorter")
        );
    }
});


var WidgetEditor = React.createClass({displayName: 'WidgetEditor',
    propTypes: {
        type: React.PropTypes.string,
        id: React.PropTypes.string,
        graded: React.PropTypes.bool,
        onChange: React.PropTypes.func
    },

    getDefaultProps: function() {
        return {
            graded: true
        };
    },

    getInitialState: function() {
        return {
            showWidget: true
        };
    },

    render: function() {
        var cls = Widgets.get(this.props.type + "-editor");

        var isUngradedEnabled = (this.props.type === "transformer");
        var direction = this.state.showWidget ? "down" : "right";

        var gradedPropBox = PropCheckBox( {label:"Graded:",
                                graded:this.props.graded,
                                onChange:this.props.onChange} );

        return React.DOM.div( {className:"perseus-widget-editor"}, 
            React.DOM.a( {href:"#", className:"perseus-widget-editor-title " +
                    (this.state.showWidget ? "open" : "closed"),
                    onClick:this.toggleWidget}, 
                this.props.id,
                React.DOM.i( {className:"icon-chevron-" + direction} )
            ),
            React.DOM.div( {className:"perseus-widget-editor-content " +
                    (this.state.showWidget ? "enter" : "leave")}, 
                isUngradedEnabled && gradedPropBox,
                cls(_.extend({
                    ref: "widget",
                    onChange: this._handleWidgetChange
                }, this.props.options))
            )
        );
    },

    toggleWidget: function(e) {
        e.preventDefault();
        this.setState({showWidget: !this.state.showWidget});
    },

    _handleWidgetChange: function(newProps, cb) {
        this.props.onChange({
            options: _.extend({}, this.props.options, newProps)
        }, cb);
    },

    toJSON: function(skipValidation) {
        return {
            type: this.props.type,
            graded: this.props.graded,
            options: this.refs.widget.toJSON(skipValidation)
        };
    }
});

var Editor = Perseus.Editor = React.createClass({displayName: 'Editor',
    getDefaultProps: function() {
        return {
            content: "",
            placeholder: "",
            widgets: {},
            widgetEnabled: true,
            immutableWidgets: false
        };
    },

    componentDidUpdate: function(prevProps, prevState) {
        // TODO(alpert): Maybe fix React so this isn't necessary
        var textarea = this.refs.textarea.getDOMNode();
        textarea.value = this.props.content;
    },

    getWidgetEditor: function(id, type) {
        if (!Widgets.get(type + "-editor")) {
            return;
        }
        return WidgetEditor(_.extend({
            ref: id,
            id: id,
            type: type,
            onChange: _.bind(this._handleWidgetEditorChange, this, id)
        }, this.props.widgets[id]));
    },

    _handleWidgetEditorChange: function(id, newProps, cb) {
        var widgets = _.clone(this.props.widgets);
        widgets[id] = _.extend({}, widgets[id], newProps);
        this.props.onChange({widgets: widgets}, cb);
    },

    render: function() {
        var pieces;
        var widgets;
        var underlayPieces;
        var widgetsDropDown;
        var templatesDropDown;
        var widgetsAndTemplates;

        if (this.props.widgetEnabled) {
            pieces = Util.split(this.props.content, rWidgetSplit);
            widgets = {};
            underlayPieces = [];

            for (var i = 0; i < pieces.length; i++) {
                var type = i % 2;
                if (type === 0) {
                    // Normal text
                    underlayPieces.push(pieces[i]);
                } else {
                    // Widget reference
                    var match = Util.rWidgetParts.exec(pieces[i]);
                    var id = match[1];
                    var type = match[2];

                    var selected = false;
                    // TODO(alpert):
                    // var selected = focused && selStart === selEnd &&
                    //         offset <= selStart &&
                    //         selStart < offset + text.length;
                    // if (selected) {
                    //     selectedWidget = id;
                    // }

                    var duplicate = id in widgets;

                    widgets[id] = this.getWidgetEditor(id, type);
                    var classes = (duplicate || !widgets[id] ? "error " : "") +
                            (selected ? "selected " : "");
                    underlayPieces.push(
                            React.DOM.b( {className:classes}, pieces[i]));
                }
            }

            // TODO(alpert): Move this to the content-change event handler
            // _.each(_.keys(this.props.widgets), function(id) {
            //     if (!(id in widgets)) {
            //         // It's strange if these preloaded options stick around
            //         // since it's inconsistent with how things work if you
            //         // don't have the serialize/deserialize step in the
            //         // middle
            //         // TODO(alpert): Save options in a consistent manner so
            //         // that you can undo the deletion of a widget
            //         delete this.props.widgets[id];
            //     }
            // }, this);

            this.widgetIds = _.keys(widgets);
            widgetsDropDown = WidgetSelect( {onChange:this.addWidget} );

            templatesDropDown = React.DOM.select( {onChange:this.addTemplate}, 
                React.DOM.option( {value:""}, "Insert template","\u2026"),
                React.DOM.option( {disabled:true}, "--"),
                React.DOM.option( {value:"table"}, "Table"),
                React.DOM.option( {value:"alignment"}, "Aligned equations"),
                React.DOM.option( {value:"piecewise"}, "Piecewise function")
            );

            if (!this.props.immutableWidgets) {
                widgetsAndTemplates = React.DOM.div( {className:"perseus-editor-widgets"}, 
                    React.DOM.div( {className:"perseus-editor-widgets-selectors"}, 
                        widgetsDropDown,
                        templatesDropDown
                    ),
                    widgets
                );
            }
        } else {
            underlayPieces = [this.props.content];
        }

        // Without this, the underlay isn't the proper size when the text ends
        // with a newline.
        underlayPieces.push(React.DOM.br(null ));

        var completeTextarea = [
                React.DOM.div( {className:"perseus-textarea-underlay", ref:"underlay"}, 
                    underlayPieces
                ),
                React.DOM.textarea( {ref:"textarea",
                          onChange:this.handleChange,
                          placeholder:this.props.placeholder,
                          value:this.props.content} )
            ];
        var textareaWrapper;
        if (Perseus.imageUploader) {
            textareaWrapper = DragTarget(
                    {onDrop:this.handleDrop,
                    className:"perseus-textarea-pair"}, 
                completeTextarea
            );
        } else {
            textareaWrapper = React.DOM.div( {className:"perseus-textarea-pair"}, 
                completeTextarea
            );
        }


        return React.DOM.div( {className:"perseus-single-editor " +
                (this.props.className || "")} , 
            textareaWrapper,
            widgetsAndTemplates
        );
    },

    handleDrop: function(e) {
        var files = e.nativeEvent.dataTransfer.files;
        var content = this.props.content;

        /* For each file we make sure it's an image, then create a sentinel -
         * snowman + identifier to insert into the current text. The sentinel
         * only lives there temporarily until we get a response back from the
         * server that the image is now hosted on AWS, at which time we replace
         * the temporary sentinel with the permanent url for the image.
         *
         * There is an abuse of tap in the middle of the pipeline to make sure
         * everything is sequenced in the correct order. We want to modify the
         * content (given any number of images) at the same time, i.e. only
         * once, so we do that step with the tap. After the content has been
         * changed we send off the request for each image.
         *
         * Note that the snowman doesn't do anything special in this case -
         * it's effectively just part of a broken link. Perseus could be
         * extended to recognize this sentinel and highlight it like for
         * widgets.
         */
        _(files)
            .chain()
            .map(function(file) {
                if (!file.type.match('image.*')) {
                    return null;
                }

                var sentinel = "\u2603 " + _.uniqueId("image_");
                // TODO(joel) - figure out how to temporarily include the image
                // before the server returns.
                content += "\n\n![](" + sentinel + ")";

                return { file: file, sentinel: sentinel };
            })
            .reject(_.isNull)
            .tap(function()  { this.props.onChange({ content: content }); }.bind(this))
            .each(function(fileAndSentinel)  {
                Perseus.imageUploader(fileAndSentinel.file, function(url)  {
                    this.props.onChange({
                        content: this.props.content.replace(
                            fileAndSentinel.sentinel, url)
                    });
                }.bind(this));
            }.bind(this));
    },

    handleChange: function() {
        var textarea = this.refs.textarea.getDOMNode();
        this.props.onChange({content: textarea.value});
    },

    addWidget: function(widgetType) {
        var oldContent = this.props.content;

        // Add newlines before "big" widgets like graphs
        if (widgetType !== "input-number" && widgetType !== "dropdown") {
            oldContent = oldContent.replace(/\n*$/, "\n\n");
        }

        for (var i = 1; oldContent.indexOf("[[\u2603 " + widgetType + " " + i +
                "]]") > -1; i++) {
            // pass
        }

        var id = widgetType + " " + i;
        var newContent = oldContent + "[[\u2603 " + id + "]]";

        var widgets = _.clone(this.props.widgets);
        widgets[id] = {type: widgetType};
        this.props.onChange({
            content: newContent,
            widgets: widgets
        }, this.focusAndMoveToEnd);
    },

    addTemplate: function(e) {
        var templateType = e.target.value;
        if (templateType === "") {
            return;
        }
        e.target.value = "";

        var oldContent = this.props.content;

        // Force templates to have a blank line before them,
        // as they are usually used as block elements
        // (especially important for tables)
        oldContent = oldContent.replace(/\n*$/, "\n\n");

        var template;
        if (templateType === "table") {
            template = "header 1 | header 2 | header 3\n" +
                       "- | - | -\n" +
                       "data 1 | data 2 | data 3\n" +
                       "data 4 | data 5 | data 6\n" +
                       "data 7 | data 8 | data 9";
        } else if (templateType === "alignment") {
            template = "$\\begin{align} x+5 &= 30 \\\\\n" +
                       "x+5-5 &= 30-5 \\\\\n" +
                       "x &= 25 \\end{align}$";
        } else if (templateType === "piecewise") {
            template = "$f(x) = \\begin{cases}\n" +
                       "7 & \\text{if $x=1$} \\\\\n" +
                       "f(x-1)+5 & \\text{if $x > 1$}\n" +
                       "\\end{cases}$";
        } else {
            throw new Error("Invalid template type: " + templateType);
        }

        var newContent = oldContent + template;

        this.props.onChange({content: newContent}, this.focusAndMoveToEnd);
    },

    toJSON: function(skipValidation) {
        // Could be _.pick(this.props, "content", "widgets"); but validation!
        var widgets = {};
        var widgetIds = _.intersection(this.widgetIds, _.keys(this.refs));

        _.each(widgetIds, function(id) {
            widgets[id] = this.refs[id].toJSON(skipValidation);
        }, this);

        return {
            content: this.props.content,
            widgets: widgets
        };
    },

    focus: function() {
        this.refs.textarea.getDOMNode().focus();
    },

    focusAndMoveToEnd: function() {
        this.focus();
        var textarea = this.refs.textarea.getDOMNode();
        textarea.selectionStart = textarea.value.length;
        textarea.selectionEnd = textarea.value.length;
    }
});
})(Perseus);

},{"./components/prop-check-box.jsx":10,"./core.js":15,"./util.js":38,"./widgets.js":39}],23:[function(require,module,exports){
/** @jsx React.DOM */
(function(Perseus) {

/* Collection of classes for rendering the hint editor area,
 * hint editor boxes, and hint previews
 */

require("./core.js");
require("./renderer.jsx");
require("./editor.jsx");
var InfoTip = require("./components/info-tip.jsx");

var Renderer = Perseus.Renderer;
var Editor = Perseus.Editor;

/* Renders just a hint preview */
var HintRenderer = Perseus.HintRenderer = React.createClass({displayName: 'HintRenderer',
    render: function() {
        var shouldBold = this.props.bold;
        var hint = this.props.hint;
        var classNames;
        if (shouldBold) {
            classNames = "perseus-hint-renderer last-hint";
        } else {
            classNames = "perseus-hint-renderer";
        }
        return React.DOM.div( {className:classNames}, 
            Renderer( {content:this.props.hint.content || ""} )
        );
    }
});

/* Renders a hint editor box
 *
 * This includes:
 *  ~ A "Hint" title
 *  ~ the textarea for the hint
 *  ~ the "remove this hint" box
 *  ~ the move hint up/down arrows
 */
var HintEditor = Perseus.HintEditor = React.createClass({displayName: 'HintEditor',
    getDefaultProps: function() {
        return {
            content: ""
        };
    },

    render: function() {
        return React.DOM.div( {className:"perseus-hint-editor perseus-editor-left-cell"}, 
            React.DOM.div( {className:"pod-title"}, "Hint"),
            Editor( {ref:"editor", content:this.props.content,
                    placeholder:"Type your hint here...",
                    onChange:this.props.onChange, widgetEnabled:false} ),

            React.DOM.div( {className:"hint-controls-container clearfix"}, 
                React.DOM.span( {className:"reorder-hints"}, 
                    React.DOM.a( {href:"#",
                        className:this.props.isLast && "hidden",
                        onClick:function() {
                            this.props.onMove(1);
                            return false;
                        }.bind(this)}, 
                        React.DOM.span( {className:"icon-circle-arrow-down"} )
                    ),
                    ' ',
                    React.DOM.a( {href:"#",
                        className:this.props.isFirst && "hidden",
                        onClick:function() {
                            this.props.onMove(-1);
                            return false;
                        }.bind(this)}, 
                        React.DOM.span( {className:"icon-circle-arrow-up"} )
                    ),
                    ' ',
                    this.props.isLast &&
                    InfoTip(null, 
                        React.DOM.p(null, "The last hint is automatically bolded.")
                    )
                ),
                React.DOM.a( {href:"#", className:"remove-hint simple-button orange",
                        onClick:function() {
                            this.props.onRemove();
                            return false;
                        }.bind(this)}, 
                    React.DOM.span( {className:"icon-trash"} ), " Remove this hint",' '
                )
            )
        );
    },

    focus: function() {
        this.refs.editor.focus();
    },

    toJSON: function(skipValidation) {
        return this.refs.editor.toJSON(skipValidation);
    }
});


/* A single hint-row containing a hint editor and preview */
var CombinedHintEditor = React.createClass({displayName: 'CombinedHintEditor',
    render: function() {
        var shouldBold = this.props.isLast &&
                         !(/\*\*/).test(this.props.hint.content);
        return React.DOM.div( {className:"perseus-combined-hint-editor " +
                    "perseus-editor-row"}, 
            HintEditor(
                {ref:"editor",
                isFirst:this.props.isFirst,
                isLast:this.props.isLast,
                content:this.props.hint.content,
                onChange:this.props.onChange,
                onRemove:this.props.onRemove,
                onMove:this.props.onMove} ),

            React.DOM.div( {className:"perseus-editor-right-cell"}, 
                HintRenderer( {hint:this.props.hint, bold:shouldBold} )
            )
        );
    },

    toJSON: function(skipValidation) {
        return this.refs.editor.toJSON(skipValidation);
    },

    focus: function() {
        this.refs.editor.focus();
    }
});


/* The entire hints editing/preview area
 *
 * Includes:
 *  ~ All the hint edit boxes, move and remove buttons
 *  ~ All the hint previews
 *  ~ The "add a hint" button
 */
var CombinedHintsEditor = Perseus.CombinedHintsEditor = React.createClass({displayName: 'CombinedHintsEditor',
    getDefaultProps: function() {
        return {
            onChange: function() {},
            hints: []
        };
    },

    render: function() {
        var hints = this.props.hints;
        var hintElems = _.map(hints, function(hint, i) {
            return CombinedHintEditor(
                        {ref:"hintEditor" + i,
                        key:"hintEditor" + i,
                        isFirst:i === 0,
                        isLast:i + 1 === hints.length,
                        hint:hint,
                        onChange:this.handleHintChange.bind(this, i),
                        onRemove:this.handleHintRemove.bind(this, i),
                        onMove:this.handleHintMove.bind(this, i)} );
        }, this);

        return React.DOM.div( {className:"perseus-hints-container perseus-editor-table"}, 
            hintElems,
            React.DOM.div( {className:"perseus-editor-row"}, 
                React.DOM.div( {className:"add-hint-container perseus-editor-left-cell"}, 
                React.DOM.a( {href:"#", className:"simple-button orange",
                        onClick:this.addHint}, 
                    React.DOM.span( {className:"icon-plus"} ),
                    ' ',"Add a hint",' '
                )
                ),
                React.DOM.div( {className:"perseus-editor-right-cell"} )
            )
        );
    },

    handleHintChange: function(i, newProps, cb) {
        var hints = _(this.props.hints).clone();
        hints[i] = _.extend({}, hints[i], newProps);
        this.props.onChange({hints: hints}, cb);
    },

    handleHintRemove: function(i) {
        var hints = _(this.props.hints).clone();
        hints.splice(i, 1);
        this.props.onChange({hints: hints});
    },

    handleHintMove: function(i, dir) {
        var hints = _(this.props.hints).clone();
        var hint = hints.splice(i, 1)[0];
        hints.splice(i + dir, 0, hint);
        this.props.onChange({hints: hints}, function() {
            this.refs["hintEditor" + (i + dir)].focus();
        }.bind(this));
    },

    addHint: function() {
        var hints = _(this.props.hints).clone().concat([{ content: "" }]);
        this.props.onChange({hints: hints}, function() {
            var i = hints.length - 1;
            this.refs["hintEditor" + i].focus();
        }.bind(this));

        // TODO(joel) - is this doing anything?
        return false;
    },

    toJSON: function(skipValidation) {
        return this.props.hints.map(function(hint, i) {
            return this.refs["hintEditor" + i].toJSON(skipValidation);
        }, this);
    }
});

})(Perseus);

},{"./components/info-tip.jsx":8,"./core.js":15,"./editor.jsx":22,"./renderer.jsx":36}],24:[function(require,module,exports){

var Movable = require("./interactive2/movable.js");
var MovablePoint = require("./interactive2/movable-point.js");
var MovableLine = require("./interactive2/movable-line.js");

var Interactive2 = {
    MovablePoint: MovablePoint,
    addMovablePoint: function(graphie, options) {
        var movable = new Movable(graphie, {});
        return new MovablePoint(graphie, movable, options);
    },
    MovableLine: MovableLine,
    addMovableLine: function(graphie, options) {
        return new MovableLine(graphie, options);
    }
};

module.exports = Interactive2;

},{"./interactive2/movable-line.js":27,"./interactive2/movable-point.js":29,"./interactive2/movable.js":30}],25:[function(require,module,exports){
/**
 * Utility functions for writing Interactive2 movablethings
 */

var MovableHelperMethods = require("./movable-helper-methods.js");

var InteractiveUtil = {
    assert: function(isTrue, message) {
        if (!isTrue) {
            throw new Error("Assertion Error" +
                    (message ? ": " + message : ""));
        }
    },

    /**
     * Create getters for this.state, based on the default state, `defaults`
     */
    createGettersFor: function(Class, defaults) {
        _.each(_.keys(defaults), function(key) {
            if (Class.prototype[key] === undefined) {
                Class.prototype[key] = function() {
                    return this.state[key];
                };
            }
        });
    },

    /**
     * Add MovableHelperMethods methods to a MovableThing class
     */
    addMovableHelperMethodsTo: function(Class) {
        _.each(MovableHelperMethods, function(methodFunc, methodName) {
            if (Class.prototype[methodName] === undefined) {
                Class.prototype[methodName] = methodFunc;
            }
        });
    },

    /**
     * Turn a function or an array of functions into an array of functions
     */
    arrayify: function(funcOrArray) {
        if (funcOrArray == null) {
            return [];
        } else if (_.isArray(funcOrArray)) {
            return _.filter(_.flatten(funcOrArray), _.identity);
        } else {
            return [funcOrArray];
        }
    },

    /**
     * Convert all function-or-array arguments to arrays of functions
     */
    normalizeOptions: function(arrayOptionNames, options) {
        // TODO(jack): Having to clone here is annoying; this
        // function should really just modify this.state in place
        // (and maybe be a function on MovableHelperMethods to get access
        // to this.state), which would also be nicer because we could
        // normalizeOptions once in this.modify
        var result = _.clone(options);
        _.each(arrayOptionNames, function(eventName) {
            var funcOrArray = options[eventName];
            // Only propagate values which were set; not present values
            // shouldn't be added to options because we'd like them to
            // fall through to defaults
            if (funcOrArray !== undefined) {
                var funcArray = InteractiveUtil.arrayify(funcOrArray);
                result[eventName] = funcArray;
            }
        });
        return result;
    },

    /* Does a pluck on keys inside objects in an object
     *
     * Ex:
     * tools = {
     *     translation: {
     *         enabled: true
     *     },
     *     rotation: {
     *         enabled: false
     *     }
     * };
     * pluckObject(tools, "enabled") returns {
     *     translation: true
     *     rotation: false
     * }
     */
    pluck: function(table, subKey) {
        return _.object(_.map(table, function(value, key) {
            return [key, value[subKey]];
        }));
    }
};

module.exports = InteractiveUtil;

},{"./movable-helper-methods.js":26}],26:[function(require,module,exports){
/**
 * MovableThing convenience methods
 *
 * Usually added to a Movable* class through
 * InteractiveUtils.addMovableHelperMethodsTo(), but these implementations
 * are simply for convenience.
 */

var kpoint = KhanUtil.kpoint;

var MovableHelperMethods = {
    /**
     * Fire an onSomething type event to all functions in listeners
     */
    _fireEvent: function(listeners, currentValue, previousValue) {
        _.invoke(listeners, "call", this, currentValue, previousValue);
    },

    /**
     * Combine the array of constraints functions
     * Returns either an [x, y] coordinate or false
     */
    _applyConstraints: function(current, previous) {
        return _.reduce(this.state.constraints, function(memo, constraint) {
            // A move that has been cancelled won't be propagated to later
            // constraints calls
            if (memo === false) {
                return false;
            }

            var result = constraint.call(this, memo, previous);
            if (result === false) {
                // Returning false cancels the move
                return false;

            } else if (kpoint.is(result, 2)) {
                // Returning a coord from constraints overrides the move
                return result;

            } else if (result === true || result == null) {
                // Returning true or undefined allow the move to occur
                return memo;

            } else {
                // Anything else is an error
                throw new Error("Constraint returned invalid result: " +
                        result);
            }
        }, current, this);
    },

    /**
     * Call all draw functions, and update our prevState for the next
     * draw function
     */
    draw: function() {
        var currState = this.cloneState();
        MovableHelperMethods._fireEvent.call(this,
            this.state.draw,
            currState,
            this.prevState
        );
        this.prevState = currState;
    },

    /**
     * Add a listener to any event: startMove, constraints, onMove, onMoveEnd,
     * etc.
     *
     * eventName: the string name of the event to listen to. one of:
     *   "onMoveStart", "onMove", "onMoveEnd", "draw", "remove"
     *
     * id: a string id that can be used to remove this event at a later time
     *   note: adding multiple listeners with the same id is undefined behavior
     *
     * func: the function to call when the event happens, which is called
     *   with the event's standard parameters [usually (coord, prevCoord) or
     *   (state, prevState)]
     */
    listen: function(eventName, id, func) {
        this._listenerMap = this._listenerMap || {};
        this._listenerMap[eventName + ":" + id] = this.state[eventName].length;
        this.state[eventName].push(func);
    },

    /**
     * Remove a previously added listener, by the id specified in the
     * corresponding listen() call
     *
     * If the given id has not been registered already, this is a no-op
     */
    unlisten: function(eventName, id) {
        this._listenerMap = this._listenerMap || {};
        var index = this._listenerMap[eventName + ":" + id];
        if (index !== undefined) {
            this.state[eventName].splice(index, 1);
        }
    }
};

module.exports = MovableHelperMethods;


},{}],27:[function(require,module,exports){
/**
 * MovableLine
 */

var Movable = require("./movable.js");
var InteractiveUtil = require("./interactive-util.js");
var assert = InteractiveUtil.assert;
var normalizeOptions = InteractiveUtil.normalizeOptions;

var knumber = KhanUtil.knumber;
var kvector = KhanUtil.kvector;
var kpoint = KhanUtil.kpoint;

var FUNCTION_ARRAY_OPTIONS = [
    "add",
    "draw",
    "remove",
    "onMoveStart",
    "constraints",
    "onMove",
    "onMoveEnd"
];

// create getters for:
//   points: () => this.state.points
//   static: () => this.state.static
// etc...
var DEFAULT_PROPERTIES = {
    points: [[0, 0], [4, 4]],
    updatePoints: false,
    static: false,
    cursor: "move",
    mouseTarget: null,
    visibleShape: null,
    normalStyle: {},
    highlightStyle: {},
    extendLine: false,
    extendRay: false
};

// Given `coord` and `angle`, find the point where a line extended
// from `coord` in the direction of `angle` would be clipped by the
// edge of the graphie canvas. Then draw an arrowhead at that point
// pointing in the direction of `angle`.
var drawArrowAtClipPoint = function(graph, coord, angle, style) {
    // Actually put the arrowheads 4px from the edge so they have
    // a bit of room
    var xExtent = graph.range[0][1] - graph.range[0][0];
    var yExtent = graph.range[1][1] - graph.range[1][0];

    // shoot a point off into the distance ...
    var distance = xExtent + yExtent;
    // we need to scale the point according to the scale of the axes
    var xDist = distance * Math.cos(angle * Math.PI / 180) *
                    xExtent / yExtent;
    var yDist = distance * Math.sin(angle * Math.PI / 180);
    var farCoord = [coord[0] + xDist, coord[1] + yDist];
    var scaledAngle = KhanUtil.findAngle(farCoord, coord);
    // ... and then bring it back
    var clipPoint = graph.constrainToBoundsOnAngle(farCoord, 4,
                                  scaledAngle * Math.PI / 180);
    clipPoint = graph.scalePoint(clipPoint);

    var arrowHead = graph.raphael.path("M-3 4 C-2.75 2.5 0 0.25 0.75 0C0 -0.25 -2.75 -2.5 -3 -4");
    arrowHead.rotate(360 - angle, 0.75, 0)
        .scale(1.4, 1.4, 0.75, 0)
        .translate(clipPoint[0], clipPoint[1])
        .attr(style)
        .attr({ "stroke-linejoin": "round", "stroke-linecap": "round", "stroke-dasharray": "" });

    return arrowHead;
};

var MovableLine = function(graphie, options) {
    assert(graphie != null);
    assert(options != null);

    _.extend(this, {
        graphie: graphie,
        state: {
            // Set here because this must be unique for each instance
            id: _.uniqueId("movableLine"),
            // Set here because:
            //  - these defaults don't exist at file execution time
            //  - these don't need getters created for them
            add: [
                MovableLine.add.draw,
                MovableLine.add.pointsToFront
            ],
            draw: [
                MovableLine.draw.basic,
                MovableLine.draw.arrows,
                MovableLine.draw.highlight
            ],
            remove: [
                MovableLine.remove.basic,
                MovableLine.remove.arrows
            ],
            onMoveStart: [],
            constraints: [],
            onMove: [],
            onMoveEnd: []
        }
    });

    this.modify(options);
};

InteractiveUtil.createGettersFor(MovableLine, DEFAULT_PROPERTIES);
InteractiveUtil.addMovableHelperMethodsTo(MovableLine);

_.extend(MovableLine.prototype, {

    cloneState: function() {
        return _.extend(this.movable.cloneState(), {
            coords: this.coords(),
        }, this.state);
    },

    modify: function(options) {
        var self = this;
        var graphie = this.graphie;

        this.remove();

        var state = _.extend(self.state, DEFAULT_PROPERTIES,
            normalizeOptions(FUNCTION_ARRAY_OPTIONS, options));

        _.defaults(state.normalStyle, {
            stroke: KhanUtil.BLUE,
            "stroke-width": 2
        });

        _.defaults(state.highlightStyle, {
            stroke: KhanUtil.ORANGE,
            "stroke-width": 3
        });

        if (!state.static) {
            // the invisible shape in front of the point that gets mouse events
            if (!state.mouseTarget) {
                state.mouseTarget = graphie.mouselayer.rect(0, -15, 1, 30);
                state.mouseTarget.attr({fill: "#000", "opacity": 0.0});
            }
        }

        if (state.static && state.mouseTarget) {
            // state.static was specified, remove any previously
            // existing mousetarget (from a previous modify)
            state.mouseTarget.remove();
            state.mouseTarget = null;
        }

        var initialRefCoord;
        var prevRefCoord;
        var totalDelta;

        self.movable = new Movable(graphie, _.extend({}, state, {
            mouseTarget: state.mouseTarget,

            add: [],
            draw: _.bind(self.draw, self),
            remove: [],

            onMoveStart: function() {
                initialRefCoord = self.coord(0);
                prevRefCoord = initialRefCoord;
                totalDelta = [0, 0];

                self._fireEvent(self.state.onMoveStart,
                    self.coord(0),
                    self.coord(0)
                );
            },

            onMove: function(mouseCoord, prevMouseCoord) {
                var delta = kvector.subtract(mouseCoord, prevMouseCoord);
                totalDelta = kvector.add(totalDelta, delta);
                var refCoord = kvector.add(initialRefCoord, totalDelta);

                refCoord = self._applyConstraints(refCoord, prevRefCoord);
                if (refCoord === false) {
                    return;
                }

                var actualDelta = kvector.subtract(refCoord, prevRefCoord);

                if (self.state.updatePoints) {
                    _.each(self.state.points, function(point) {
                        point.setCoord(kvector.add(
                            point.coord(),
                            actualDelta
                        ));
                    });
                }

                self._fireEvent(self.state.onMove, refCoord, prevRefCoord);
                prevRefCoord = refCoord;
            },

            onMoveEnd: function() {
                self._fireEvent(self.state.onMoveEnd,
                    prevRefCoord,
                    initialRefCoord
                );
            },
        }));

        // Update the line with the points' movement
        _.invoke(state.points, "listen", "onMove", state.id,
                _.bind(self.draw, self));

        self.prevState = self.cloneState();
        self._fireEvent(state.add, self.prevState);
        // Update the state if add() changed it
        self.prevState = self.cloneState();
    },

    coords: function() {
        return _.invoke(this.state.points, "coord");
    },

    point: function(index) {
        return this.state.points[index];
    },

    coord: function(index) {
        return this.point(index).coord();
    },

    remove: function() {
        this._fireEvent(this.state.remove);
        if (this.points) {
            _.invoke(this.points, "unlisten", "onMove", this.state.id);
        }

        if (this.movable) {
            // We need this to be guarded because it is called on the initial
            // constructor/modify call, before this.movable is created
            this.movable.remove();
        }
    },

    // Change z-order to back
    toBack: function() {
        this.movable.toBack();
        if (this.state.visibleShape) {
            this.state.visibleShape.toBack();
        }
    },

    // Change z-order to front
    toFront: function() {
        if (this.state.visibleShape) {
            this.state.visibleShape.toFront();
        }
        this.movable.toFront();
    },

    /**
     * Forwarding methods to this.movable:
     */
    isHovering: function() {
        return this.movable.isHovering();
    },

    isDragging: function() {
        return this.movable.isDragging();
    },

    mouseTarget: function() {
        return this.movable.mouseTarget();
    }
});

var getScaledPolarDiff = function(line) {
    var scaledA = line.graphie.scalePoint(line.coord(0));
    var scaledZ = line.graphie.scalePoint(line.coord(1));
    var polarDiff = kvector.polarDegFromCart(
        kvector.subtract(
            scaledZ,
            scaledA
        )
    );
    return polarDiff;
};

_.extend(MovableLine, {
    add: {
        draw: function() {
            this.draw();
        },

        pointsToFront: function(state) {
            _.invoke(state.points, "toFront");
        }
    },

    draw: {
        basic: function(state) {
            var graphie = this.graphie;
            if (!this.state.visibleShape) {
                this.state.visibleShape = graphie.path(
                    [[0, 0]],
                    this.normalStyle()
                );
                this.state.visibleShape.attr({
                    path: KhanUtil.unscaledSvgPath([[0, 0], [1, 0]])
                });
            }


            // Clip the line 5px from the edge of the graphie to allow for
            // arrowheads
            if (state.extendLine || state.extendRay) {
                this.state.visibleShape.attr({
                    "clip-rect": "5 5 " + (graphie.dimensions[0] - 10) + " " +
                        (graphie.dimensions[1] - 10)
                });
            }

            var scaledA = graphie.scalePoint(this.coord(0));
            var scaledZ = graphie.scalePoint(this.coord(1));
            var polarDiff = getScaledPolarDiff(this);
            var lineLength = polarDiff[0];
            var angle = polarDiff[1];

            var elements = [this.state.visibleShape];
            if (this.mouseTarget()) {
                elements.push(this.mouseTarget());
            }
            _.each(elements, function(element) {
                element.translate(scaledA[0] - element.attr("translation").x,
                        scaledA[1] - element.attr("translation").y);
                element.rotate(angle, scaledA[0], scaledA[1]);
                if (state.extendLine) {
                    element.translate(-0.5, 0);
                    lineLength = graphie.dimensions[0] + graphie.dimensions[1];
                    lineLength = 2 * lineLength;
                } else if (state.extendRay) {
                    lineLength = graphie.dimensions[0] + graphie.dimensions[1];
                }
                element.scale(lineLength, 1, scaledA[0], scaledA[1]);
            });
        },

        arrows: function(state) {
            if (this._arrows != null) {
                _.invoke(this._arrows, "remove");
            }
            this._arrows = [];

            var polarDiff = getScaledPolarDiff(this);
            var angle = polarDiff[1];

            if (state.extendLine) {
                this._arrows.push(drawArrowAtClipPoint(
                    this.graphie, this.state.points[0].coord(), 360 - angle,
                    this.normalStyle()));
                this._arrows.push(drawArrowAtClipPoint(
                    this.graphie, this.state.points[1].coord(),
                    (540 - angle) % 360,
                    this.normalStyle()));
            } else if (state.extendRay) {
                this._arrows.push(drawArrowAtClipPoint(
                    this.graphie, this.state.points[0].coord(), 360 - angle,
                    this.normalStyle()));
            }
        },

        highlight: function(state, prevState) {
            // TODO(jack): Figure out a way to highlight the points attached to
            // the line. Maybe this means an additional isHovering: []
            // function to state of movable/movablepoint to define [additional?]
            // times it should be highlighted
            if (state.isHovering && !prevState.isHovering) {
                state.visibleShape.animate(
                    state.highlightStyle,
                    50
                );
            } else if (!state.isHovering && prevState.isHovering) {
                state.visibleShape.animate(
                    state.normalStyle,
                    50
                );
            }
        }
    },

    remove: {
        basic: function() {
            if (this.state.visibleShape) {
                this.state.visibleShape.remove();
            }
        },
        arrows: function() {
            if (this._arrows != null) {
                _.invoke(this._arrows, "remove");
            }
        }
    },

    constraints: {
        fixed: function() {
            return function() { return false; };
        },

        snap: function(snap) {
            return function(coord, prevCoord) {
                if (snap === null) {
                    return true;
                }
                var delta = kvector.subtract(coord, prevCoord);
                snap = snap || this.graphie.snap;
                delta = kpoint.roundTo(delta, snap);
                return kvector.add(prevCoord, delta);
            };
        },

        bound: function(range, snap, paddingPx) {
            if (paddingPx === undefined) {
                if (range === undefined) {
                    paddingPx = 10;
                } else {
                    paddingPx = 0;
                }
            }
            return function(coord, prevCoord) {
                var graphie = this.graphie;
                var delta = kvector.subtract(coord, prevCoord);
                var range = range || graphie.range;
                // A null snap means no snap; an undefined snap means
                // default to graphie's
                if (snap === undefined) {
                    snap = graphie.snap;
                }

                // Calculate the bounds for both points
                var absoluteLower = graphie.unscalePoint([
                    paddingPx,
                    graphie.ypixels - paddingPx
                ]);
                var absoluteUpper = graphie.unscalePoint([
                    graphie.xpixels - paddingPx,
                    paddingPx
                ]);
                if (snap) {
                    absoluteLower = kpoint.ceilTo(absoluteLower, snap);
                    absoluteUpper = kpoint.floorTo(absoluteUpper, snap);
                }

                // Calculate the bounds for the delta.
                var deltaBounds = _.map(this.coords(), function(coord, i) {
                    var max = kvector.subtract(absoluteUpper, coord);
                    var min = kvector.subtract(absoluteLower, coord);
                    return [min, max];
                });

                // bound the delta by the calculated bounds
                var boundedDelta = _.reduce(deltaBounds,
                        function(delta, bound) {
                    var lower = bound[0];
                    var upper = bound[1];
                    var deltaX = Math.max(lower[0], Math.min(upper[0], delta[0]));
                    var deltaY = Math.max(lower[1], Math.min(upper[1], delta[1]));
                    return [deltaX, deltaY];
                }, delta);

                return kvector.add(prevCoord, boundedDelta);
            };
        }
    }
});

module.exports = MovableLine;

},{"./interactive-util.js":25,"./movable.js":30}],28:[function(require,module,exports){
/**
 * A library of options to pass to add/draw/remove/constraints
 */

var knumber = KhanUtil.knumber;
var kpoint = KhanUtil.kpoint;

var add = {
    constrain: function() {
        var result = this._applyConstraints(this.coord(), this.coord());
        if (kpoint.is(result)) {
            this.setCoord(result);
        }
    },

    draw: function() {
        this.draw();
    }
};

add.standard = [add.constrain, add.draw];


var draw = {
    basic: function() {
        var graphie = this.graphie;
        if (!this.state.visibleShape) {
            this.state.visibleShape = graphie.ellipse(
                this.coord(),
                [
                    this.pointSize() / graphie.scale[0],
                    this.pointSize() / graphie.scale[1]
                ],
                _.omit(this.normalStyle(), "scale")
            );
        }
        var scaledPoint = graphie.scalePoint(this.coord());
        this.state.visibleShape.attr({cx: scaledPoint[0]});
        this.state.visibleShape.attr({cy: scaledPoint[1]});
        if (this.mouseTarget()) {
            this.mouseTarget().attr({ cx: scaledPoint[0] });
            this.mouseTarget().attr({ cy: scaledPoint[1] });
        }
    },

    highlight: function(state, prevState) {
        if (state.isHovering && !prevState.isHovering) {
            state.visibleShape.animate(
                state.highlightStyle,
                50
            );
        } else if (!state.isHovering && prevState.isHovering) {
            state.visibleShape.animate(
                state.normalStyle,
                50
            );
        }
    }
};

draw.standard = [draw.basic, draw.highlight];


var remove = {
    basic: function() {
        if (this.state.visibleShape) {
            this.state.visibleShape.remove();
            this.state.visibleShape = null;
        }
    }
};

remove.standard = remove.basic;


var constraints = {
    fixed: function() {
        return function() { return false; };
    },

    snap: function(snap) {
        return function(coord) {
            if (snap === null) {
                return true;
            }
            snap = snap || this.graphie.snap;
            return kpoint.roundTo(coord, snap);
        };
    },

    bound: function(range, snap, paddingPx) {
        if (paddingPx === undefined) {
            if (range === undefined) {
                paddingPx = 10;
            } else {
                paddingPx = 0;
            }
        }
        return function(coord) {
            var graphie = this.graphie;
            range = range || graphie.range;
            if (snap === undefined) {
                snap = graphie.snap;
            }

            var lower = graphie.unscalePoint([
                paddingPx,
                graphie.ypixels - paddingPx
            ]);
            var upper = graphie.unscalePoint([
                graphie.xpixels - paddingPx,
                paddingPx
            ]);
            if (snap) {
                lower = kpoint.ceilTo(lower, snap);
                upper = kpoint.floorTo(upper, snap);
            }
            var coordX = Math.max(lower[0], Math.min(upper[0], coord[0]));
            var coordY = Math.max(lower[1], Math.min(upper[1], coord[1]));
            return [coordX, coordY];
        };
    }
};

constraints.standard = null;

module.exports = {
    add: add,
    draw: draw,
    remove: remove,

    onMoveStart: {standard: null},
    constraints: constraints,
    onMove: {standard: null},
    onMoveEnd: {standard: null},
    onClick: {standard: null}
};

},{}],29:[function(require,module,exports){
/**
 * Creates and adds a point to the graph that can be dragged around.
 * It allows constraints on its movement and draws when moves happen.
 *
 * Options can be passed to the constructor to control how the point behaves:
 *   coord: [x, y]
 *     The initial position of the point
 *   pointSize:
 *     changes the size of the point. defaults to 4
 *   static: boolean
 *     draw the point, but don't let it be interactable
 *   cursor: "move", "pointer"
 *     css cursor for this point
 *   add: [function(state)]
 *     called immediately when this movablePoint is added
 *     default: apply any constraints and draw
 *   draw: [function(prevState, currentState)]
 *     drawing functions. default to [basic, highlight]
 *   remove: [function(state)]
 *     called when this movablePoint is removed
 *   onMoveStart: [function(coord)]
 *     called when this point is clicked on
 *   constraints: [function(coord)]
 *     called when this point is dragged
 *     return true or nothing to accept the move
 *     return false to cancel the move
 *     return an [x, y] coordinate to override the move
 *   onMove: [function(coord)]
 *     called after all constraints functions pass and the point
 *     is moved to a new location
 *   onMoveEnd: [function(coord)]
 *     called when the mouse is released from a click or move
 *   onClick: [function(coord)]
 *     called when someone mouses down, doesn't move the point,
 *     and mouses up.
 *   normalStyle:
 *     the raphael/graphie style of the point when not hovering
 *   highlightStyle:
 *     the raphael/graphie style of the point when hovering, if
 *     MovablePoint.draw.highlight is used
 *
 * This creates a MovablePoint object with the following methods:
 *   setCoord: [x, y]
 *     changes the point's coordinate
 *   draw:
 *     redraws the coord
 *   modify: {options}
 *     modifies the original options passed to the point
 *   remove:
 *     removes the point from graphie
 */

var MovablePointOptions = require("./movable-point-options.js");
var InteractiveUtil = require("./interactive-util.js");
var assert = InteractiveUtil.assert;
var normalizeOptions = InteractiveUtil.normalizeOptions;

var knumber = KhanUtil.knumber;
var kpoint = KhanUtil.kpoint;

// state parameters that should be converted into an array of
// functions
var FUNCTION_ARRAY_OPTIONS = _.keys(MovablePointOptions);

// default state. these properties are added to this.state and
// receive magic getter methods (this.coord() etc)
var DEFAULT_PROPERTIES = {
    coord: [0, 0],
    pointSize: 4,
    hasMoved: false,
    static: false,
    cursor: "move",
    mouseTarget: null,
    visibleShape: null,
    normalStyle: {},
    highlightStyle: {}
};

var MovablePoint = function(graphie, movable, options) {
    _.extend(this, {
        graphie: graphie,
        movable: movable,
        state: _.extend({
            // Set here because this must be unique for each instance
            id: _.uniqueId("movablePoint")
        }, normalizeOptions(
            // These defaults are set here instead of DEFAULT_PROPERTIES
            // they don't need getters created for them
            // TODO(jack) We really ough to normalize once, in this.modify()
            // TODO(jack): Consider "default" once we es3ify perseus
            FUNCTION_ARRAY_OPTIONS,
            InteractiveUtil.pluck(MovablePointOptions, "standard")
        ), DEFAULT_PROPERTIES)
    });

    this.modify(options);
};

_.extend(MovablePoint, MovablePointOptions);
InteractiveUtil.createGettersFor(MovablePoint, DEFAULT_PROPERTIES);
InteractiveUtil.addMovableHelperMethodsTo(MovablePoint);

_.extend(MovablePoint.prototype, {

    cloneState: function() {
        return _.extend(this.movable.cloneState(), this.state);
    },

    modify: function(options) {
        this.remove();
        var self = this;
        var graphie = this.graphie;
        var state = _.extend(self.state,
                normalizeOptions(FUNCTION_ARRAY_OPTIONS, options));

        // Default things inside the state.normalStyle object, because
        // _.extend is not deep
        state.normalStyle = _.extend({
            fill: KhanUtil.ORANGE,
            stroke: KhanUtil.ORANGE,
            scale: 1
        }, state.normalStyle);

        // Default things inside the state.highlightStyle object, because
        // _.extend is not deep
        state.highlightStyle = _.extend({
            fill: KhanUtil.ORANGE,
            stroke: KhanUtil.ORANGE,
            scale: 2
        }, state.highlightStyle);

        if (!state.static) {
            // the invisible shape in front of the point that gets mouse events
            if (!state.mouseTarget) {
                state.mouseTarget = graphie.mouselayer.circle(
                    graphie.scalePoint(self.state.coord)[0],
                    graphie.scalePoint(self.state.coord)[1],
                    15
                );
                state.mouseTarget.attr({fill: "#000", opacity: 0.0});
            }
        }

        // The starting coord of any move, sent to onMoveEnd as the previous
        // value
        var startCoord = state.coord;

        // The Movable representing this movablePoint's representation
        // This handles mouse events for us, which we propagate in
        // onMove
        self.movable.modify(_.extend({}, state, {
            add: [],
            draw: _.bind(self.draw, self),
            remove: [],
            onMoveStart: function() {
                state.hasMoved = false;
                startCoord = state.coord;
                self._fireEvent(state.onMoveStart, startCoord, startCoord);
                self.draw();
            },
            onMove: function(coord) {
                // The caller has the option of adding an onMove() method to the
                // movablePoint object we return as a sort of event handler
                // By returning false from onMove(), the move can be vetoed,
                // providing custom constraints on where the point can be moved.
                // By returning array [x, y], the move can be overridden

                var result = self._applyConstraints(coord, state.coord);
                if (result === false) {
                    return;
                } else if (kpoint.is(result)) {
                    coord = result;
                }
                if (!kpoint.equal(coord, state.coord)) {
                    var prevCoord = state.coord;
                    state.coord = coord;
                    state.hasMoved = true;
                    self._fireEvent(state.onMove, state.coord, prevCoord);
                    self.draw();
                }
            },
            onMoveEnd: function() {
                if (self.isHovering() && !state.hasMoved) {
                    self._fireEvent(state.onClick, state.coord, startCoord);
                }
                self._fireEvent(state.onMoveEnd, state.coord, startCoord);
                state.hasMoved = false;
                self.draw();
            }
        }));

        self.prevState = self.cloneState();
        self._fireEvent(state.add, self.prevState);
        // Update the state if add() changed it
        self.prevState = self.cloneState();
    },

    remove: function() {
        this._fireEvent(this.state.remove);
        if (this.movable) {
            this.movable.remove();
        }
        // TODO(jack): This should really be moved off of
        // movablePoint.state and only kept on movable.state
        this.state.mouseTarget = null;
    },

    setCoord: function(coord) {
        assert(kpoint.is(coord, 2));
        this.state.coord = _.clone(coord);
        this.draw();
    },

    // Change z-order to back
    toBack: function() {
        this.movable.toBack();
        if (this.state.visibleShape) {
            this.state.visibleShape.toBack();
        }
    },

    // Change z-order to front
    toFront: function() {
        if (this.state.visibleShape) {
            this.state.visibleShape.toFront();
        }
        this.movable.toFront();
    },

    /**
     * Forwarding methods to this.movable:
     */
    isHovering: function() {
        return this.movable.isHovering();
    },

    isDragging: function() {
        return this.movable.isDragging();
    },

    mouseTarget: function() {
        return this.movable.mouseTarget();
    }
});

module.exports = MovablePoint;

},{"./interactive-util.js":25,"./movable-point-options.js":28}],30:[function(require,module,exports){
/**
 * Movable
 *
 * A Movable Something, that sends onMove events based on the
 * mouse coordinate (graphie unscaled, non-pixel-value) of the
 * move.
 *
 * Other MovableThings should generally have a Movable field, and
 * let this class handle all of the virtual mouse events, and then
 * take appropriate action in onMoveStart, onMove, onMoveEnd
 */

var InteractiveUtil = require("./interactive-util.js");
var normalizeOptions = InteractiveUtil.normalizeOptions;

var knumber = KhanUtil.knumber;
var kpoint = KhanUtil.kpoint;

// state parameters that should be converted into an array of
// functions
var FUNCTION_ARRAY_OPTIONS = [
    "add",
    "draw",
    "remove",
    "onMoveStart",
    "onMove",
    "onMoveEnd",
    "onClick"
];

// default state. these properties are added to this.state and
// receive magic getter methods (this.isHovering() etc)
var DEFAULT_PROPERTIES = {
    isHovering: false,
    isMouseOver: false,
    isDragging: false,
    cursor: null,
    mouseTarget: null
};

var Movable = function(graphie, options) {
    _.extend(this, {
        graphie: graphie,
        state: {
            id: _.uniqueId("movable"),
            add: [],
            draw: [],
            remove: [],
            onMoveStart: [],
            onMove: [],
            onMoveEnd: [],
            onClick: []
        }
    });

    this.modify(options);
};

InteractiveUtil.createGettersFor(Movable, DEFAULT_PROPERTIES);
InteractiveUtil.addMovableHelperMethodsTo(Movable);

_.extend(Movable.prototype, {

    cloneState: function() {
        return _.clone(this.state);
    },

    modify: function(options) {
        var self = this;
        var graphie = self.graphie;

        self.remove();

        var state = _.extend(self.state, DEFAULT_PROPERTIES,
            normalizeOptions(FUNCTION_ARRAY_OPTIONS, options));

        // the invisible shape in front of the point that gets mouse events
        if (state.mouseTarget) {
            var $mouseTarget = $(state.mouseTarget[0]);

            if (state.cursor !== undefined) {
                // "" removes the css cursor if state.cursor is null
                $mouseTarget.css("cursor", state.cursor || "");
            }

            $mouseTarget.on("vmouseover", function() {
                state.isMouseOver = true;
                if (!graphie.isDragging) {
                    state.isHovering = true;
                }
                self.draw();
            });

            $mouseTarget.on("vmouseout", function() {
                state.isMouseOver = false;
                if (!state.isDragging) {
                    state.isHovering = false;
                }
                self.draw();
            });

            $mouseTarget.on("vmousedown", function(e) {
                if (e.which !== 0 && e.which !== 1) {
                    return;
                }
                e.preventDefault();

                var startMouseCoord = graphie.getMouseCoord(e);
                var prevMouseCoord = startMouseCoord;
                self._fireEvent(
                    state.onMoveStart,
                    startMouseCoord,
                    startMouseCoord
                );

                $(document).bind("vmousemove", function(e) {
                    e.preventDefault();

                    state.isDragging = true;
                    graphie.isDragging = true;

                    var mouseCoord = graphie.getMouseCoord(e);
                    self._fireEvent(
                        state.onMove,
                        mouseCoord,
                        prevMouseCoord
                    );
                    self.draw();
                    prevMouseCoord = mouseCoord;
                });

                $(document).bind("vmouseup", function(e) {
                    $(document).unbind("vmousemove vmouseup");
                    if (state.isHovering) {
                        self._fireEvent(
                            state.onClick,
                            prevMouseCoord,
                            startMouseCoord
                        );
                    }
                    state.isHovering = self.state.isMouseOver;
                    state.isDragging = false;
                    graphie.isDragging = false;
                    self._fireEvent(
                        state.onMoveEnd,
                        prevMouseCoord,
                        startMouseCoord
                    );
                    self.draw();
                });
            });
        }

        self.prevState = self.cloneState();
        self._fireEvent(state.add, self.prevState);
        // Update the state if add() changed it
        self.prevState = self.cloneState();
    },

    remove: function() {
        this._fireEvent(this.state.remove);
        if (this.state.mouseTarget) {
            $(this.state.mouseTarget).off();
            this.state.mouseTarget.remove();
            this.state.mouseTarget = null;
        }
    },

    // Change z-order to back
    toBack: function() {
        if (this.state.mouseTarget) {
            this.state.mouseTarget.toBack();
        }
    },

    // Change z-order to front
    toFront: function() {
        if (this.state.mouseTarget) {
            this.state.mouseTarget.toFront();
        }
    }
});

module.exports = Movable;

},{"./interactive-util.js":25}],31:[function(require,module,exports){
/** @jsx React.DOM */
(function(Perseus) {

require("./core.js");
require("./editor.jsx");
require("./answer-area-editor.jsx");

var Editor = Perseus.Editor;

var AnswerAreaEditor = Perseus.AnswerAreaEditor;

var ItemEditor = Perseus.ItemEditor = React.createClass({displayName: 'ItemEditor',
    getDefaultProps: function() {
        return {
            onChange: function() {},
            question: {},
            answerArea: {}
        };
    },

    // Notify the parent that the question or answer area has been updated.
    updateProps: function(newProps, cb) {
        var props = _(this.props).pick("question", "answerArea");
        this.props.onChange(_(props).extend(newProps), cb);
    },

    render: function() {
        return React.DOM.div( {className:"perseus-editor-table"}, 
            React.DOM.div( {className:"perseus-editor-row perseus-question-container"}, 
                React.DOM.div( {className:"perseus-editor-left-cell"}, 
                    React.DOM.div( {className:"pod-title"}, "Question"),
                    Editor(_.extend({
                        ref: "questionEditor",
                        placeholder: "Type your question here...",
                        className: "perseus-question-editor",
                        onChange: function(newProps, cb) {
                            var question = _.extend({},
                                    this.props.question, newProps);
                            this.updateProps({question: question}, cb);
                        }.bind(this)
                    }, this.props.question))
                ),

                React.DOM.div( {className:"perseus-editor-right-cell"}, 
                    React.DOM.div( {id:"problemarea"}, 
                        React.DOM.div( {id:"workarea", className:"workarea"} ),
                        React.DOM.div( {id:"hintsarea",
                             className:"hintsarea",
                             style:{display: "none"}} )
                    )
                )
            ),

            React.DOM.div( {className:"perseus-editor-row perseus-answer-container"}, 
                React.DOM.div( {className:"perseus-editor-left-cell"}, 
                    React.DOM.div( {className:"pod-title"}, "Answer"),
                    AnswerAreaEditor(_.extend({
                        ref: "answerAreaEditor",
                        onChange: function(newProps, cb) {
                            var answerArea = _.extend({},
                                    this.props.answerArea, newProps);
                            this.updateProps({answerArea: answerArea}, cb);
                        }.bind(this)
                    }, this.props.answerArea))
                ),

                React.DOM.div( {className:"perseus-editor-right-cell"}, 
                    React.DOM.div( {id:"answer_area"}, 
                        React.DOM.span( {id:"examples-show", style:{display: "none"}}, 
                            ' ',"Acceptable formats",' '
                        ),
                        React.DOM.div( {id:"solutionarea", className:"solutionarea"} ),
                        React.DOM.div( {className:"answer-buttons"}, 
                            React.DOM.input(
                                {type:"button",
                                className:"simple-button disabled green",
                                value:"Check Answer"} )
                        )
                    )
                )
            )
        );
    },

    toJSON: function(skipValidation) {
        return {
            question: this.refs.questionEditor.toJSON(skipValidation),
            answerArea: this.refs.answerAreaEditor.toJSON(skipValidation)
        };
    },

    focus: function() {
        this.questionEditor.focus();
    }
});

})(Perseus);

},{"./answer-area-editor.jsx":3,"./core.js":15,"./editor.jsx":22}],32:[function(require,module,exports){
/** @jsx React.DOM */
(function(Perseus) {

require("./core.js");
require("./answer-area-editor.jsx");
require("./hint-editor.jsx");
require("./renderer.jsx");
require("./all-widgets.js");
var Util = require("./util.js");

var AnswerAreaRenderer = Perseus.AnswerAreaRenderer;

var HintRenderer = Perseus.HintRenderer;

var HintsRenderer = React.createClass({displayName: 'HintsRenderer',
    render: function() {
        var hintsVisible = this.props.hintsVisible;
        var hints = this.props.hints
            .slice(0, hintsVisible === -1 ? undefined : hintsVisible)
            .map(function(hint, i) {
                var shouldBold = i === this.props.hints.length - 1 &&
                                 !(/\*\*/).test(hint.content);
                return HintRenderer(
                            {bold:shouldBold,
                            hint:hint,
                            key:"hintRenderer" + i} );
            }, this);

        return React.DOM.div(null, hints);
    }
});

var highlightedWidgets = function(widgetList) 
    {return _.filter(widgetList, Util.widgetShouldHighlight);};

var ItemRenderer = Perseus.ItemRenderer = React.createClass({displayName: 'ItemRenderer',
    getDefaultProps: function() {
        return {
            initialHintsVisible: 0,

            // TODO(joel) - handle this differently. Pass around nodes or
            // something half reasonable.
            workAreaSelector: "#workarea",
            solutionAreaSelector: "#solutionarea",
            hintsAreaSelector: "#hintsarea",
            shouldIndicate: false
        };
    },

    getInitialState: function() {
        return {
            hintsVisible: this.props.initialHintsVisible,
            questionAreaUsedWidgets: [],
            answerAreaUsedWidgets: []
        };
    },

    componentWillReceiveProps: function(nextProps) {
        this.setState({
            questionAreaUsedWidgets: [],
            answerAreaUsedWidgets: []
        });
    },

    componentDidMount: function() {
        if (Khan.scratchpad) {
            Khan.scratchpad.enable();
        }
        this.update();
    },

    componentDidUpdate: function() {
        this.update();
    },

    numWidgetsRemaining: function() {
        return this.numWidgets() -
            (this.state.questionAreaUsedWidgets.length +
             this.state.answerAreaUsedWidgets.length);
    },

    numWidgets: function() {
        var amountInAnswerArea = this.numAnswerAreaWidgets();
        var widgets = this.props.item.question.widgets;
        return _.size(highlightedWidgets(widgets)) + amountInAnswerArea;
    },

    numAnswerAreaWidgets: function() {
        if (this.props.item.answerArea.type === "multiple") {
            var widgets = this.props.item.answerArea.options.widgets;
            return _.size(highlightedWidgets(widgets));
        } else {
            return 1;
        }
    },

    update: function() {
        // Since the item renderer works by rendering things into three divs
        // that have completely different places in the DOM, we have to do this
        // strangeness instead of relying on React's normal render() method.
        // TODO(alpert): Figure out how to clean this up somehow
        this.questionRenderer = React.renderComponent(
                Perseus.Renderer(_.extend({
                    problemNum: this.props.problemNum,
                    onInteractWithWidget: this.handleInteractWithWidget,
                    usedWidgets: this.state.questionAreaUsedWidgets,
                    shouldIndicate: this.props.shouldIndicate
                }, this.props.item.question)),
                document.querySelector(this.props.workAreaSelector));

        this.answerAreaRenderer = React.renderComponent(
                AnswerAreaRenderer({
                    type: this.props.item.answerArea.type,
                    options: this.props.item.answerArea.options,
                    calculator: this.props.item.answerArea.calculator || false,
                    problemNum: this.props.problemNum,
                    onInteractWithWidget: this.handleInteractWithAnswerWidget,
                    usedWidgets: this.state.answerAreaUsedWidgets,
                    shouldIndicate: this.props.shouldIndicate,
                    numWidgetsRemaining: this.numWidgetsRemaining(),
                    numWidgets: this.numWidgets()
                }),
                document.querySelector(this.props.solutionAreaSelector));

        this.hintsRenderer = React.renderComponent(
                HintsRenderer({
                    hints: this.props.item.hints,
                    hintsVisible: this.state.hintsVisible
                }),
                document.querySelector(this.props.hintsAreaSelector));
    },

    addWidgetIdTo: function(set, widgetId) {
        this.setState(_.object([[set, _.union(this.state[set], [widgetId])]]));
    },

    handleInteractWithWidget: function(widgetId) {
        this.addWidgetIdTo("questionAreaUsedWidgets", widgetId);
    },

    handleInteractWithAnswerWidget: function(widgetId) {
        this.addWidgetIdTo("answerAreaUsedWidgets", widgetId);
    },

    render: function() {
        return React.DOM.div(null );
    },

    focus: function() {
        return this.questionRenderer.focus() ||
                this.answerAreaRenderer.focus();
    },

    componentWillUnmount: function() {
        React.unmountComponentAtNode(
                document.querySelector(this.props.workAreaSelector));
        React.unmountComponentAtNode(
                document.querySelector(this.props.solutionAreaSelector));
        React.unmountComponentAtNode(
                document.querySelector(this.props.hintsAreaSelector));
    },

    showHint: function() {
        if (this.state.hintsVisible < this.getNumHints()) {
            this.setState({
                hintsVisible: this.state.hintsVisible + 1
            });
        }
    },

    getNumHints: function() {
        return this.props.item.hints.length;
    },

    scoreInput: function() {
        var qGuessAndScore = this.questionRenderer.guessAndScore();
        var aGuessAndScore = this.answerAreaRenderer.guessAndScore();

        var qGuess = qGuessAndScore[0], qScore = qGuessAndScore[1];
        var aGuess = aGuessAndScore[0], aScore = aGuessAndScore[1];

        var guess, score;
        if (qGuess.length === 0) {
            // No widgets in question. For compatability with old guess format,
            // leave it out here completely.
            guess = aGuess;
            score = aScore;
        } else {
            guess = [qGuess, aGuess];
            score = Util.combineScores(qScore, aScore);
        }

        if (score.type === "points") {
            return {
                empty: false,
                correct: score.earned >= score.total,
                message: score.message,
                guess: guess
            };
        } else if (score.type === "invalid") {
            return {
                empty: true,
                correct: false,
                message: score.message,
                guess: guess
            };
        }
    }
});

})(Perseus);

},{"./all-widgets.js":2,"./answer-area-editor.jsx":3,"./core.js":15,"./hint-editor.jsx":23,"./renderer.jsx":36,"./util.js":38}],33:[function(require,module,exports){
/** @jsx React.DOM */
/**
 * Changeable
 *
 * Adds a this.change() function to a component
 *
 * This.change takes prop changes as parameters, and calls
 * this.props.onChange with the modified props.
 */

var USAGE = "Usage:\n" +
            "  this.change({propName: 5}, callback);\n" +
            "  this.change(\"propName\", 5, callback);\n" +
            "  this.change(\"propName\")";

/**
 * Primary helper function for this.change()
 *
 * Takes the parameters in a consistent style, once this.change() has
 * figured out which way it was called.
 */
var _changeMultiple = function(component, newProps, callback) {
    // Omit "default" props:
    // ref and key come from react, and don't actually represent
    //   the conceptual state of our component
    // onChange comes from our parent to allow this modification,
    //   and doesn't conceptually represent the state of our component
    var currProps = _.omit(component.props, "onChange", "ref", "key");
    var nextProps = _.extend(currProps, newProps);
    component.props.onChange(nextProps, callback);
};

/**
 * Helper function for changing a single prop
 */
var _changeSingle = function(component, propName, value, callback) {
    if (value === undefined) {
        // If called with a single prop name, return a lambda to change
        // a single prop on the current object
        return _.partial(_changeSingle, component, propName);
    } else {
        // If called with two values, change a single prop of the
        // current object
        var newProps = {};
        newProps[propName] = value;
        _changeMultiple(component, newProps, callback);
    }
};

/**
 * this.change()
 *
 * Can be called as follows:
 * this.change(newProps, callback);
 *
 * this.change(propName, propValue, callback);
 *
 * this.change(propName) -> returns a lambda that takes a prop value to
 * set and a callback to call after having set that value.
 */
var change = function(newPropsOrSinglePropName,
                      propValue,
                      callback) {

    if (_.isObject(newPropsOrSinglePropName) &&
            callback === undefined) {
        // Called with an object of multiple props to change
        callback = propValue;
        return _changeMultiple(
            this,
            newPropsOrSinglePropName,  // object newProps
            callback
        );

    } else if (_.isString(newPropsOrSinglePropName)) {
        // Called with a string propName of a single prop to change
        return _changeSingle(
            this,
            newPropsOrSinglePropName,  // string propName
            propValue,
            callback
        );

    } else {
        throw new Error("Invalid types sent to this.change(): " +
                _.toArray(arguments).join() + "\n" + USAGE);
    }
};

var Changeable = {
    propTypes: {
        onChange: React.PropTypes.func.isRequired
    },
    change: change
};

module.exports = Changeable;

},{}],34:[function(require,module,exports){
/** @jsx React.DOM */

var JsonifyProps = {
    toJSON: function() {
        // Omit props that get passed to all widgets
        return _.omit(this.props,
            // standard props "added" by react
            // (technically the renderer still adds them)
            "key",
            "ref",
            // added by src/renderer.jsx
            "onChange",
            "problemNum"
        );
    }
};

module.exports = JsonifyProps;

},{}],35:[function(require,module,exports){
/** @jsx React.DOM */

var cx = React.addons.classSet;

var QuestionParagraph = React.createClass({displayName: 'QuestionParagraph',
    propTypes: {
        usedWidgets: React.PropTypes.array,
        totalWidgets: React.PropTypes.array,
        shouldIndicate: React.PropTypes.bool
    },

    isAnswered: function() {
        var totalWidgets = this.props.totalWidgets;
        var usedWidgets = this.props.usedWidgets;
        return totalWidgets.length === usedWidgets.length;
    },

    render: function() {
        if (!this.props.shouldIndicate || _.isEmpty(this.props.totalWidgets)) {
            return React.DOM.div(null, this.props.children);
        }
        var answered = this.isAnswered();
        var className = cx({
            "perseus-indicator": true,
            "answered": answered,
            "unanswered": !answered,
            "ui-helper-clearfix": true,
            "wrapper": true
        });

        return React.DOM.div( {className:className}, 
            this.props.children
        );
    }
});

module.exports = QuestionParagraph;

},{}],36:[function(require,module,exports){
/** @jsx React.DOM */
(function(Perseus) {

require("./core.js");
var Util = require("./util.js");

var TeX = require("./tex.jsx");
var Widgets = require("./widgets.js");

var QuestionParagraph = require("./question-paragraph.jsx");


var specialChars = {
    // escaped: original
    "\\a": "\u0007", // \a isn't valid javascript
    "\\b": "\b",
    "\\t": "\t",
    "\\n": "\n",
    "\\v": "\v",
    "\\f": "\f",
    "\\r": "\r",
    "\\\\": "\\"
};

var rEscapedChars = /\\a|\\b|\\t|\\n|\\v|\\f|\\r|\\\\/g; 
 
if (typeof KA !== "undefined" && KA.language === "en-PT") {
    // When using crowdin's jipt (Just in place translation), we need to keep a
    // registry of crowdinId's to component so that we can update the
    // component's state as the translator enters their translation.
    Perseus.TranslationComponents = [];

    if (!KA.jipt_dom_insert_checks) {
        KA.jipt_dom_insert_checks = [];
    }

    // We add a function that will get called whenever jipt says the dom needs
    // to be updated
    KA.jipt_dom_insert_checks.push(function(text, node, attribute) {
        var index = $(node).data("perseus-component-index");
        // We only update if we had added an index onto the node's data. 
        if (node && typeof index !== "undefined") {
            var component = Perseus.TranslationComponents[index];
            // Jipt sends down the escaped translation, so we need to
            // unescape \\t to \t among other charachters here
            text = text.replace(
                rEscapedChars,
                function(ch) {
                    return specialChars[ch];
                });

            component.setState({
                jiptContent: text
            });

            // Return false to tell jipt not to insert anything into the DOM
            // itself, otherwise it will mess up what React expects there to be
            return false;
        }
        // The string updated wasn't part of perseus, so we tell jipt to just
        // insert the translation as-is.
        return text;
    });
}

var CLEAR_WIDGETS_BLACKLIST = ["onChange", "usedWidgets"];

var Renderer = Perseus.Renderer = React.createClass({displayName: 'Renderer',

    componentWillReceiveProps: function(nextProps) {
        if (!_.isEqual(_.omit(this.props, CLEAR_WIDGETS_BLACKLIST),
                       _.omit(nextProps, CLEAR_WIDGETS_BLACKLIST))) {
            this.setState({widgets: {}});
        }
    },

    getDefaultProps: function() {
        return {
            content: "",
            ignoreMissingWidgets: false,
            shouldIndicate: false,
            // onRender may be called multiple times per render, for example
            // if there are multiple images or TeX pieces within `content`.
            // It is a good idea to debounce any functions passed here.
            onRender: function() {}
        };
    },

    getInitialState: function() {
        // TODO(alpert): Move up to parent props?
        return {
            widgets: {},
            jiptContent: null
        };
    },

    shouldComponentUpdate: function(nextProps, nextState) {
        var stateChanged = !_.isEqual(this.state, nextState);
        var propsChanged = !_.isEqual(this.props, nextProps);
        return propsChanged || stateChanged;
    },

    getPiece: function(saved, widgetIds) {
        if (saved.charAt(0) === "@") {
            // Just text
            return saved;
        } else if (saved.charAt(0) === "$") {
            // Math
            var tex = saved.slice(1, saved.length - 1);
            return TeX( {onRender:this.props.onRender}, tex);
        } else if (saved.charAt(0) === "[") {
            // Widget
            var match = Util.rWidgetParts.exec(saved);
            var id = match[1];
            var type = match[2];

            var widgetInfo = (this.props.widgets || {})[id];
            if (widgetInfo || this.props.ignoreMissingWidgets) {
                widgetIds.push(id);
                var cls = Widgets.get(type);

                return cls(_.extend({},
                    (widgetInfo || {}).options,
                    this.state.widgets[id],
                    {
                        ref: id,
                        problemNum: this.props.problemNum,
                        onChange: function(newProps, cb)  {
                            var widgets = _.clone(this.state.widgets);
                            widgets[id] = _.extend({}, widgets[id], newProps);
                            this.setState({widgets: widgets}, cb);
                            this.props.onInteractWithWidget(id);
                        }.bind(this)
                    }
                ));
            }
        }
    },

    render: function() {
        var content = this.state.jiptContent || this.props.content;

        if (typeof KA !== "undefined" && KA.language === "en-PT" && 
                this.state.jiptContent == null &&
                this.props.content.indexOf('crwdns') !== -1) {
            // Crowdin's JIPT (Just in place translation) uses a fake language
            // with language tag "en-PT" where the value of the translations
            // look like: {crwdns2657085:0}{crwdne2657085:0} where it keeps the
            // {crowdinId:ngettext variant}. We detect whether the current
            // content matches this, so we can take over rendering of
            // the perseus content as the translators interact with jipt.
            // We search for only part of the tag that crowdin uses to guard 
            // against them changing the format on us. The full tag it looks 
            // for can be found in https://cdn.crowdin.net/jipt/jipt.js 
            // globalPhrase var.

            // If we haven't already added this component to the registry do so
            // now. showHints() may cause this component to be rerendered 
            // before jipt has a chance to replace its contents, so this check 
            // will keep us from adding the component to the registry a second 
            // time.
            if (!this.translationIndex) {
                this.translationIndex = 
                    Perseus.TranslationComponents.push(this) - 1;
            }
            // We now need to output this tag, as jipt looks for it to be
            // able to replace it with a translation that it runs an ajax 
            // call to get.  We add a data attribute with the index to the
            // Persues.TranslationComponent registry so that when jipt 
            // calls its before_dom_insert we can lookup this component by 
            // this attribute and render the text with markdown.
            return React.DOM.div( 
                    {'data-perseus-component-index':this.translationIndex}, 
                content
            );
        }
        var self = this;
        var extracted = extractMathAndWidgets(content);
        var markdown = extracted[0];
        var savedMath = extracted[1];
        var widgetIds = this.widgetIds = [];

        var oldWidgetIds = [];

        // XXX(alpert): smartypants gets called on each text node before it's
        // added to the DOM tree, so we override it to insert the math and
        // widgets.
        var smartypants = markedReact.InlineLexer.prototype.smartypants;
        markedReact.InlineLexer.prototype.smartypants = function(text) {
            var startingWidgets = _.clone(widgetIds);
            var pieces = Util.split(text, /@@(\d+)@@/g);
            for (var i = 0; i < pieces.length; i++) {
                var type = i % 2;
                if (type === 0) {
                    pieces[i] = smartypants.call(this, pieces[i]);
                } else if (type === 1) {
                    // A saved math-or-widget number
                    pieces[i] = self.getPiece(savedMath[pieces[i]], widgetIds);
                }
            }
            return pieces;
        };

        // We want to set the paragraph function so we can keep track of which
        // widgets were added in which paragraph
        var markedOptions = {
            paragraphFn: function(text) {
                var newWidgetIds = _.difference(widgetIds, oldWidgetIds);
                newWidgetIds = _.filter(newWidgetIds, function(widgetId) 
                    {return Util.widgetShouldHighlight(self.props.widgets[widgetId]);});
                oldWidgetIds = _.clone(widgetIds);
                var relevantUsedWidgets = _.intersection(newWidgetIds,
                                                     self.props.usedWidgets);
                return QuestionParagraph(
                    {totalWidgets:newWidgetIds,
                    usedWidgets:relevantUsedWidgets,
                    shouldIndicate:self.props.shouldIndicate} , 
                    text
                );
            }
        };

        try {
            return React.DOM.div(null, markedReact(markdown, markedOptions));
        } catch (e) {
            // IE8 requires `catch` in order to use `finally`
            throw e;
        } finally {
            markedReact.InlineLexer.prototype.smartypants = smartypants;
        }
    },

    handleRender: function() {
        var onRender = this.props.onRender;

        // Fire callback on image load...
        $(this.getDOMNode()).find("img").on("load", onRender);

        // ...as well as right now (non-image, non-TeX or image from cache)
        onRender();
    },

    componentDidMount: function() {
        this.handleRender();
     },

    componentDidUpdate: function() {
        this.handleRender();
    },

    focus: function() {
        // Use _.some to break if any widget gets focused
        var focused = _.some(this.widgetIds, function(id) {
            var widget = this.refs[id];
            return widget.focus && widget.focus();
        }, this);

        if (focused) {
            return true;
        }
    },

    toJSON: function(skipValidation) {
        var state = {};
        _.each(this.props.widgets, function(props, id) {
            var widget = this.refs[id];
            var s = widget.toJSON(skipValidation);
            if (!_.isEmpty(s)) {
                state[id] = s;
            }
        }, this);
        return state;
    },

    guessAndScore: function() {
        var widgetProps = this.props.widgets;

        var totalGuess = _.map(this.widgetIds, function(id) {
            return this.refs[id].toJSON();
        }, this);

        var totalScore = _.chain(this.widgetIds)
                .filter(function(id) {
                    var props = widgetProps[id];
                    // props.graded is unset or true
                    return props.graded == null || props.graded;
                })
                .map(function(id) {
                    var props = widgetProps[id];
                    var widget = this.refs[id];
                    return widget.simpleValidate(props.options);
                }, this)
                .reduce(Util.combineScores, Util.noScore)
                .value();

        return [totalGuess, totalScore];
    },

    examples: function() {
        var widgets = _.values(this.refs);
        var examples = _.compact(_.map(widgets, function(widget) {
            return widget.examples ? widget.examples() : null;
        }));

        // no widgets with examples
        if (!examples.length) {
            return null;
        }

        var allEqual = _.all(examples, function(example) {
            return _.isEqual(examples[0], example);
        });

        // some widgets have different examples
        // TODO(alex): handle this better
        if (!allEqual) {
            return null;
        }

        return examples[0];
    }
});

var rInteresting =
        /(\$|[{}]|\\[\\${}]|\n{2,}|\[\[\u2603 [a-z-]+ [0-9]+\]\]|@@\d+@@)/g;

function extractMathAndWidgets(text) {
    // "$x$ is a cool number, just like $6 * 7$!" gives
    //     ["@@0@@ is a cool number, just like @@1@@!", ["$x$", "$6 * 7$"]]
    //
    // Inspired by http://stackoverflow.com/q/11231030.
    var savedMath = [];
    var blocks = Util.split(text, rInteresting);

    var mathPieces = [], l = blocks.length, block, braces;
    for (var i = 0; i < l; i++) {
        block = blocks[i];

        if (mathPieces.length) {
            // Looking for an end delimeter
            mathPieces.push(block);
            blocks[i] = "";

            if (block === "$" && braces <= 0) {
                blocks[i] = saveMath(mathPieces.join(""));
                mathPieces = [];
            } else if (block.slice(0, 2) === "\n\n" || i === l - 1) {
                // We're at the end of a line... just don't do anything
                // TODO(alpert): Error somehow?
                blocks[i] = mathPieces.join("");
                mathPieces = [];
            } else if (block === "{") {
                braces++;
            } else if (block === "}") {
                braces--;
            }
        } else if (i % 2 === 1) {
            // Looking for a start delimeter
            var two = block && block.slice(0, 2);
            if (two === "[[" || two === "@@") {
                // A widget or an @@n@@ thing (which we pull out so we don't
                // get confused later).
                blocks[i] = saveMath(block);
            } else if (block === "$") {
                // We got one! Save it for later and blank out its space.
                mathPieces.push(block);
                blocks[i] = "";
                braces = 0;
            }
            // Else, just normal text. Move along, move along.
        }
    }

    return [blocks.join(""), savedMath];

    function saveMath(math) {
        savedMath.push(math);
        return "@@" + (savedMath.length - 1) + "@@";
    }
}

Renderer.extractMathAndWidgets = extractMathAndWidgets;

})(Perseus);

},{"./core.js":15,"./question-paragraph.jsx":35,"./tex.jsx":37,"./util.js":38,"./widgets.js":39}],37:[function(require,module,exports){
/** @jsx React.DOM */
/**
 * For math rendered using MathJax. Use me like <TeX>2x + 3</TeX>.
 */

require("./core.js");

// TODO(jack): Remove this closure now that this is in it's own file
var TeX = (function() {
    var pendingScripts = [];
    var needsProcess = false;
    var timeout = null;

    function process(script, callback) {
        pendingScripts.push(script);
        if (!needsProcess) {
            needsProcess = true;
            timeout = setTimeout(doProcess, 0, callback);
        }
    }

    function doProcess(callback) {
        MathJax.Hub.Queue(function() {
            var oldElementScripts = MathJax.Hub.elementScripts;
            MathJax.Hub.elementScripts = function(element) {
                var scripts = pendingScripts;
                pendingScripts = [];
                needsProcess = false;
                return scripts;
            };

            try {
                return MathJax.Hub.Process(null, callback);
            } catch (e) {
                // IE8 requires `catch` in order to use `finally`
                throw e;
            } finally {
                MathJax.Hub.elementScripts = oldElementScripts;
            }
        });
    }

    return React.createClass({
        getDefaultProps: function() {
            return {
                // Called after math is rendered or re-rendered
                onRender: function() {}
            };
        },

        render: function() {
            return React.DOM.span(null, 
                React.DOM.span( {ref:"mathjax"} ),
                React.DOM.span( {ref:"katex"} )
            );
        },

        componentDidMount: function() {
            var text = this.props.children;
            var onRender = this.props.onRender;

            if (typeof Exercises === "undefined" || Exercises.useKatex) {
                try {
                    var katexHolder = this.refs.katex.getDOMNode();
                    katex.process(text, katexHolder);
                    onRender();
                    return;
                } catch (e) {
                    /* jshint -W103 */
                    if (e.__proto__ !== katex.ParseError.prototype) {
                    /* jshint +W103 */
                        throw e;
                    }
                }
            }

            this.setScriptText(text);
            process(this.script, onRender);
        },

        componentDidUpdate: function(prevProps, prevState) {
            var oldText = prevProps.children;
            var newText = this.props.children;
            var onRender = this.props.onRender;

            if (oldText !== newText) {
                if (typeof Exercises === "undefined" || Exercises.useKatex) {
                    try {
                        var katexHolder = this.refs.katex.getDOMNode();
                        katex.process(newText, katexHolder);
                        if (this.script) {
                            var jax = MathJax.Hub.getJaxFor(this.script);
                            if (jax) {
                                jax.Remove();
                            }
                        }
                        onRender();
                        return;
                    } catch (e) {
                        /* jshint -W103 */
                        if (e.__proto__ !== katex.ParseError.prototype) {
                        /* jshint +W103 */
                            throw e;
                        }
                    }
                }

                $(this.refs.katex.getDOMNode()).empty();

                if (this.script) {
                    var component = this;
                    MathJax.Hub.Queue(function() {
                        var jax = MathJax.Hub.getJaxFor(component.script);
                        if (jax) {
                            return jax.Text(newText, onRender);
                        } else {
                            component.setScriptText(newText);
                            process(component.script, onRender);
                        }
                    });
                } else {
                    this.setScriptText(newText);
                    process(this.script, onRender);
                }
            }
        },

        setScriptText: function(text) {
            if (!this.script) {
                this.script = document.createElement("script");
                this.script.type = "math/tex";
                this.refs.mathjax.getDOMNode().appendChild(this.script);
            }
            if ("text" in this.script) {
                // IE8, etc
                this.script.text = text;
            } else {
                this.script.textContent = text;
            }
        },

        componentWillUnmount: function() {
            if (this.script) {
                var jax = MathJax.Hub.getJaxFor(this.script);
                if (jax) {
                    jax.Remove();
                }
            }
        }
    });
})();

module.exports = TeX;


},{"./core.js":15}],38:[function(require,module,exports){
var Util = {
    rWidgetParts: /^\[\[\u2603 (([a-z-]+) ([0-9]+))\]\]$/,

    noScore: {
        type: "points",
        earned: 0,
        total: 0,
        message: null
    },

    seededRNG: function(seed) {
        var randomSeed = seed;

        return function() {
            // Robert Jenkins' 32 bit integer hash function.
            var seed = randomSeed;
            seed = ((seed + 0x7ed55d16) + (seed << 12)) & 0xffffffff;
            seed = ((seed ^ 0xc761c23c) ^ (seed >>> 19)) & 0xffffffff;
            seed = ((seed + 0x165667b1) + (seed << 5)) & 0xffffffff;
            seed = ((seed + 0xd3a2646c) ^ (seed << 9)) & 0xffffffff;
            seed = ((seed + 0xfd7046c5) + (seed << 3)) & 0xffffffff;
            seed = ((seed ^ 0xb55a4f09) ^ (seed >>> 16)) & 0xffffffff;
            return (randomSeed = (seed & 0xfffffff)) / 0x10000000;
        };
    },

    // Shuffle an array using a given random seed or function.
    // If `ensurePermuted` is true, the input and ouput are guaranteed to be
    // distinct permutations.
    shuffle: function(array, randomSeed, ensurePermuted) {
        // Always return a copy of the input array
        var shuffled = _.clone(array);

        // Handle edge cases (input array is empty or uniform)
        if (!shuffled.length || _.all(shuffled, function(value) {
                                    return _.isEqual(value, shuffled[0]);
                                })) {
            return shuffled;
        }

        var random;
        if (_.isFunction(randomSeed)) {
            random = randomSeed;
        } else {
            random = Util.seededRNG(randomSeed);
        }

        do {
            // Fischer-Yates shuffle
            for (var top = shuffled.length; top > 0; top--) {
                var newEnd = Math.floor(random() * top),
                    temp = shuffled[newEnd];

                shuffled[newEnd] = shuffled[top - 1];
                shuffled[top - 1] = temp;
            }
        } while (ensurePermuted && _.isEqual(array, shuffled));

        return shuffled;
    },

    // In IE8, split doesn't work right. Implement it ourselves.
    split: "x".split(/(.)/g).length ?
        function(str, r) { return str.split(r); } :
        function(str, r) {
            // Based on Steven Levithan's MIT-licensed split, available at
            // http://blog.stevenlevithan.com/archives/cross-browser-split
            var output = [];
            var lastIndex = r.lastIndex = 0;
            var match;

            while ((match = r.exec(str))) {
                output.push(str.slice(lastIndex, match.index));
                output.push.apply(output, match.slice(1));
                lastIndex = match.index + match[0].length;
            }

            output.push(str.slice(lastIndex));
            return output;
        },

    /**
     * Given two score objects for two different widgets, combine them so that
     * if one is wrong, the total score is wrong, etc.
     */
    combineScores: function(scoreA, scoreB) {
        var message;

        if (scoreA.type === "points" && scoreB.type === "points") {
            if (scoreA.message && scoreB.message &&
                    scoreA.message !== scoreB.message) {
                // TODO(alpert): Figure out how to combine messages usefully
                message = null;
            } else {
                message = scoreA.message || scoreB.message;
            }

            return {
                type: "points",
                earned: scoreA.earned + scoreB.earned,
                total: scoreA.total + scoreB.total,
                message: message
            };

        } else if (scoreA.type === "points" && scoreB.type === "invalid") {
            return scoreB;

        } else if (scoreA.type === "invalid" && scoreB.type === "points") {
            return scoreA;

        } else if (scoreA.type === "invalid" && scoreB.type === "invalid") {
            if (scoreA.message && scoreB.message &&
                    scoreA.message !== scoreB.message) {
                // TODO(alpert): Figure out how to combine messages usefully
                message = null;
            } else {
                message = scoreA.message || scoreB.message;
            }

            return {
                type: "invalid",
                message: message
            };
        }
    },

    /**
     * Return the first valid interpretation of 'text' as a number, in the form
     * {value: 2.3, exact: true}.
     */
    firstNumericalParse: function(text) {
        // TODO(alpert): This is sort of hacky...
        var first;
        var val = Khan.answerTypes.predicate.createValidatorFunctional(
            function(ans) {
                first = ans;
                return true;  /* break */
            }, {
                simplify: "optional",
                inexact: true,
                forms: "integer, proper, improper, pi, log, mixed, decimal"
            });

        val(text);
        return first;
    },

    stringArrayOfSize: function(size) {
        return _(size).times(function() {
            return "";
        });
    },

    /**
     * For a graph's x or y dimension, given the tick step,
     * the ranges extent (e.g. [-10, 10]), the pixel dimension constraint,
     * and the grid step, return a bunch of configurations for that dimension.
     *
     * Example:
     *      gridDimensionConfig(10, [-50, 50], 400, 5)
     *
     * Returns: {
     *      scale: 4,
     *      snap: 2.5,
     *      tickStep: 2,
     *      unityLabel: true
     * };
     */
    gridDimensionConfig: function(absTickStep, extent, dimensionConstraint,
                                     gridStep) {
        var scale = Util.scaleFromExtent(extent, dimensionConstraint);
        var stepPx = absTickStep * scale;
        var unityLabel = stepPx > 30;
        return {
            scale: scale,
            tickStep: absTickStep / gridStep,
            unityLabel: unityLabel
        };
    },

    /**
     * Given the range, step, and boxSize, calculate the reasonable gridStep.
     * Used for when one was not given explicitly.
     *
     * Example:
     *      getGridStep([[-10, 10], [-10, 10]], [1, 1], 340)
     *
     * Returns: [1, 1]
     */
    getGridStep: function(range, step, boxSize) {
        return _(2).times(function(i) {
            var scale = Util.scaleFromExtent(range[i], boxSize);
            var gridStep = Util.gridStepFromTickStep(step[i], scale);
            return gridStep;
        });
    },

    snapStepFromGridStep: function(gridStep) {
        return _.map(gridStep, function(step) { return step / 2; });
    },

    /**
     * Given the range and a dimension, come up with the appropriate
     * scale.
     * Example:
     *      scaleFromExtent([-25, 25], 500) // returns 10
     */
    scaleFromExtent: function(extent, dimensionConstraint) {
        var span = extent[1] - extent[0];
        var scale = dimensionConstraint / span;
        return scale;
    },

    /**
     * Return a reasonable tick step given extent and dimension.
     * (extent is [begin, end] of the domain.)
     * Example:
     *      tickStepFromExtent([-10, 10], 300) // returns 2
     */
    tickStepFromExtent: function(extent, dimensionConstraint) {
        var span = extent[1] - extent[0];

        var tickFactor;
        // If single number digits
        if (15 < span && span <= 20) {
            tickFactor = 23;

        // triple digit or decimal
        } else if (span > 100 || span < 5) {
            tickFactor = 10;

        // double digit
        } else {
            tickFactor = 16;
        }
        var constraintFactor = dimensionConstraint / 500;
        var desiredNumTicks = tickFactor * constraintFactor;
        return Util.tickStepFromNumTicks(span, desiredNumTicks);
    },

    /**
     * Given the tickStep and the graph's scale, find a
     * grid step.
     * Example:
     *      gridStepFromTickStep(200, 0.2) // returns 100
     */
    gridStepFromTickStep: function(tickStep, scale) {
        var tickWidth = tickStep * scale;
        var x = tickStep;
        var y = Math.pow(10, Math.floor(Math.log(x) / Math.LN10));
        var leadingDigit = Math.floor(x / y);
        if (tickWidth < 25) {
            return tickStep;
        }
        if (tickWidth < 50) {
            if (leadingDigit === 5) {
                return tickStep;
            } else {
                return tickStep / 2;
            }
        }
        if (leadingDigit === 1) {
            return tickStep / 2;
        }
        if (leadingDigit === 2) {
            return tickStep / 4;
        }
        if (leadingDigit === 5) {
            return tickStep / 5;
        }
    },

    /**
     * Find a good tick step for the desired number of ticks in the range
     * Modified from d3.scale.linear: d3_scale_linearTickRange.
     * Thanks, mbostock!
     * Example:
     *      tickStepFromNumTicks(50, 6) // returns 10
     */
    tickStepFromNumTicks: function(span, numTicks) {
        var step = Math.pow(10, Math.floor(Math.log(span / numTicks) / Math.LN10));
        var err = numTicks / span * step;

        // Filter ticks to get closer to the desired count.
        if (err <= 0.15) {
            step *= 10;
        } else if (err <= 0.35) {
            step *= 5;
        } else if (err <= 0.75) {
            step *= 2;
        }

        // Round start and stop values to step interval.
        return step;
    },

    /**
     * Transparently update deprecated props so that the code to deal
     * with them only lives in one place: (Widget).deprecatedProps
     * 
     * For example, if a boolean `foo` was deprecated in favor of a
     * number 'bar':
     *      deprecatedProps: {
     *          foo: function(props) {
     *              return {bar: props.foo ? 1 : 0};
     *          }
     *      }
     */
    DeprecationMixin: {
        // This lifecycle stage is only called before first render
        componentWillMount: function() {
            var newProps = {};

            _.each(this.deprecatedProps, function(func, prop) {
                if (_.has(this.props, prop)) {
                    _.extend(newProps, func(this.props));
                }
            }, this);

            if (!_.isEmpty(newProps)) {
                // Set new props directly so that widget renders correctly
                // when it first mounts, even though these will be overwritten
                // almost immediately afterwards...
                _.extend(this.props, newProps);

                // ...when we propagate the new props upwards and they come
                // back down again.
                setTimeout(this.props.onChange, 0, newProps);    
            }
        }
    },

    /**
     * Approximate equality on numbers and primitives.
     */
    eq: function(x, y) {
        if (_.isNumber(x) && _.isNumber(y)) {
            return Math.abs(x - y) < 1e-9;
        } else {
            return x === y;
        }
    }, 

    /**
     * Deep approximate equality on primitives, numbers, arrays, and objects.
     */
    deepEq: function(x, y) {
        if (_.isArray(x) && _.isArray(y)) {
            if (x.length !== y.length) {
                return false;
            }
            for (var i = 0; i < x.length; i++) {
                if (!Util.deepEq(x[i], y[i])) {
                    return false;
                }
            }
            return true;
        } else if (_.isArray(x) || _.isArray(y)) {
            return false;
        } else if (_.isObject(x) && _.isObject(y)) {
            return _.all(x, function(value, key) {
                return Util.deepEq(y[key], value);
            }) && _.all(y, function(value, key) {
                return Util.deepEq(x[key], value);
            });
        } else if (_.isObject(x) || _.isObject(y)) {
            return false;
        } else {
            return Util.eq(x, y);
        }
    },

    /**
     * Query String Parser
     *
     * Original from:
     * http://stackoverflow.com/questions/901115/get-querystring-values-in-javascript/2880929#2880929
     */
    parseQueryString: function(query) {
        query = query || window.location.search.substring(1);
        var urlParams = {},
            e,
            a = /\+/g,  // Regex for replacing addition symbol with a space
            r = /([^&=]+)=?([^&]*)/g,
            d = function(s) { return decodeURIComponent(s.replace(a, " ")); };

        while ((e = r.exec(query))) {
            urlParams[d(e[1])] = d(e[2]);
        }

        return urlParams;
    },

    // There are certain widgets where we don't want to provide the "answered"
    // highlight indicator.
    // The issue with just using the `graded` flag on questions is that showing
    // that a certain widget is ungraded can sometimes reveal the answer to a
    // question ("is this transformation possible? if so, do it")
    // This is kind of a hack to get around this.
    widgetShouldHighlight: function(widget) {
        var HIGHLIGHT_BAR_BLACKLIST = ["measurer", "protractor"];
        return !_.contains(HIGHLIGHT_BAR_BLACKLIST, widget.type);
    }
};

Util.random = Util.seededRNG(new Date().getTime() & 0xffffffff);

module.exports = Util;


},{}],39:[function(require,module,exports){
require("./core.js");

var widgetTypes = {};

var Widgets = Perseus.Widgets = {
    get: function(type) {
        return widgetTypes[type];
    },

    register: function(type, widgetClass) {
        widgetTypes[type] = widgetClass;
    }
};

module.exports = Widgets;


},{"./core.js":15}],40:[function(require,module,exports){
/** @jsx React.DOM */
(function(Perseus) {

require("../core.js");
require("../renderer.jsx");

var InfoTip = require("../components/info-tip.jsx");
var Widgets = require("../widgets.js");

var defaultNumCategories = 2;

function removeFromArray(array, item) {
    var index = _.indexOf(array, item);
    if (index >= 0) {
        array.splice(index, 1);
    }
}

function coordsRelativeTo(coords, div) {
    return _.map(offsetToCoords($(div).offset()), function(offset, i) {
        return coords[i] - offset;
    });
}

function offsetToCoords(offset) {
    return [offset.left, offset.top];
}

function getMouseCoords(e) {
    if (_.has(e, "nativeEvent")) {
        e = e.nativeEvent;
    }
    return [e.pageX, e.pageY];
}

function offsetCoordsBy(coords, offset) {
    return _.map(coords, function(coord, i) {
        return coord - offset[i];
    });
}

function getDimensions($ele) {
    return [$ele.outerWidth(), $ele.outerHeight()];
}

function findDimensionsFor(root, ele) {
    var $ele = $(ele);
    var offset = offsetToCoords($ele.offset());
    return getAllCoordTypes(offset, $ele, root);
}

function withinBox(box, middle) {
    return _.every(middle, function(coord, i) {
        var c = box.topLeft[i];
        return c <= coord && coord <= c + box.dimensions[i];
    });
}

function getAllCoordTypes(coords, $ele, root) {
    var topLeft = coordsRelativeTo(coords, root);
    var dimensions = getDimensions($ele);
    return {
        dimensions: dimensions,
        topLeft: topLeft,
        middle: _.map(dimensions, function(dim, i) {
            return topLeft[i] + dim / 2;
        })
    };
}

function cloneMatrix(matrix) {
    return _.map(matrix, function(row) {
        return row.slice();
    });
}

function blankItem(position) {
    return {
        content: "",
        location: {
            category: 0,
            position: position || 0
        }
    };
}

function getDefaultProps() {
    var item = blankItem();
    return {
        isEditor: false,
        items: [item],
        correctLocations: [item.location],
        categoryHeaders: [""]
    };
}

function isBank(category) {
    return category === 0;
}

function nextPosition(items) {
    var item = _.max(items, function (item) {
        return item.location.position;
    });
    return item.location.position + 1;
}

function nextPositionCorrectLocations(correctLocations) {
    return _.max(_.pluck(correctLocations, "position")) + 1;
}

// This is adapted from the calculation in orderer.
// It gives an animation time that is distance dependent,
// based on the square root of the distance.
function dragReturnAnimationTime(fromCoords, toCoords) {
    var squareDistance = _.reduce(fromCoords, function(squareD, coord, i) {
        var diff = toCoords[i] - coord;
        return squareD + diff * diff;
    }, 0);
    var distance = Math.sqrt(squareDistance);
    return Math.max(15 * Math.sqrt(distance), 1);
}

var Categorization = React.createClass({displayName: 'Categorization',
    getDefaultProps: getDefaultProps,

    getInitialState: function() {
        return {
            showDragHint: true,
            dragging: null
        };
    },

    getAllMouseCoordTypes: function(mouseCoords, $ele) {
        var offsetMouse = offsetCoordsBy(
                mouseCoords, this.state.dragging.offset);
        var c = getAllCoordTypes(offsetMouse, $ele, $(this.getDOMNode()));
        c.mouse = mouseCoords;
        return c;
    },

    getItems: function() {
        return _.map(this.props.items, function(item, index) {
            return _.extend({index: index}, item);
        });
    },

    startDrag: function(itemIndex, event) {
        var self = this;
        if (itemIndex == null || self.state.dragging) {
            return;
        }
        var items = self.getItems();
        var item = items[itemIndex];

        var cardDiv = $(event.target);
        while (!cardDiv.hasClass("card")) {
            cardDiv = cardDiv.parent();
        }
        var coords = getMouseCoords(event);
        var offset = coordsRelativeTo(coords, cardDiv);
        var root = $(self.getDOMNode());
        var categories = root.find(".categories .category");
        var findDims = _.partial(findDimensionsFor, root);
        self.categoryDimensions = _.map(categories, findDims);
        if (self.props.isEditor) {
            var deleteItem = root.find(".delete-item-area");
            self.deleteItemDimensions = findDimensionsFor(root, deleteItem);
        }

        self.setState({
            dragging: {
                itemIndex: itemIndex,
                offset: offset
            }
        }, _.bind(self.updateDrag, self, coords));

        $(document)
        .on("vmousemove.categorization", function(e) {
            self.updateDrag(getMouseCoords(e));
        })
        .on("vmouseup.categorization", function(e) {
            self.endDrag(getMouseCoords(e));
        });
    },

    findDrag: function() {
        return $(this.getDOMNode()).find(".card.dragging");
    },

    updateDrag: function(coords) {
        var self = this;
        var $drag = this.findDrag();

        var c = self.getAllMouseCoordTypes(coords, $drag);
        var middle = c.middle;
        $drag
            .css("left", c.topLeft[0])
            .css("top", c.topLeft[1]);
        var targetCategory = self.findTargetCategory(middle);
        self.setState({targetCategory: targetCategory});
    },

    findTargetCategory: function(middle) {
        var self = this;
        var categoryIndex;
        if (self.props.isEditor) {
            if (withinBox(self.deleteItemDimensions, middle)) {
                return "delete";
            }
        }
        var inCategory = _.find(self.categoryDimensions, function(col, index) {
            categoryIndex = index;
            return withinBox(col, middle);
        });

        // 0th category is bank
        if (!inCategory) {
            return 0;
        }

        // Therefore true categories get incremented indicies.
        return categoryIndex + 1;
    },

    endDrag: function(coords) {
        var self = this;
        var dragging = self.state.dragging;
        if (!dragging) {
            return;
        }
        var $drag = self.findDrag();
        var items = self.getItems();
        var itemIndex = dragging.itemIndex;
        var item = items[itemIndex];

        $(document)
            .off("vmousemove.categorization")
            .off("vmouseup.categorization");

        var c = self.getAllMouseCoordTypes(coords, $drag);
        var targetCategory = self.findTargetCategory(c.middle);

        if (targetCategory === "delete") {
            self.updateLocation(targetCategory);
            self.props.deleteItem(itemIndex);
            return;
        }

        var root = $(self.getDOMNode());
        var returnedToSame = false;
        if (_.isEqual(targetCategory, item.location.category)) {
            returnedToSame = true;
        }
        var slotClass;
        if (returnedToSame) {
            slotClass = ".card.placeholder";
        } else {
            slotClass = ".card-empty-slot";
        }
        var offsetTop = false;
        var slot = root.find(
                ".category-" + targetCategory + " " + slotClass);
        if (!returnedToSame) {
            if (!isBank(item.location.category) &&
                item.location.category < targetCategory) {
                offsetTop = true;
            }
        }
        var dims = findDimensionsFor(root, slot);
        var topLeft = {left: dims.topLeft[0], top: dims.topLeft[1]};
        if (offsetTop) {
            var placeholder = root.find(".category-" +
                    item.location.category + " .card.placeholder");
            var parentDims = getDimensions(placeholder.parent());
            topLeft.top -= parentDims[1];
        }
        var animationTime = dragReturnAnimationTime(
                c.topLeft, dims.topLeft);
        $drag.animate(topLeft, {
            duration: animationTime,
            complete: _.bind(self.updateLocation, self, targetCategory)
        });
    },

    updateLocation: function(targetCategory) {
        var self = this;
        var items = self.getItems();
        var itemIndex = self.state.dragging.itemIndex;
        var item = items[itemIndex];

        var change = {
            targetCategory: null,
            dragging: null
        };
        if (item.location.category !== targetCategory) {
            var position = nextPosition(items);
            item.location = {
                category: targetCategory,
                position: position
            };
            change.showDragHint = false;
            self.props.onChange({
                items: items
            });
        }
        self.setState(change);
    },

    render: function() {
        var self = this;
        var items = self.getItems();
        var targetCategory = self.state.targetCategory;
        var dragging = self.state.dragging;
        var isEditor = self.props.isEditor;

        var dragItem;
        if (dragging) {
            dragItem = CategoryItem({
                isDragItem: true,
                item: dragging ? items[dragging.itemIndex] : null,
                isEditor: this.props.isEditor
            });
        }

        // bank
        var bank = React.DOM.div( {className:"bank"}, 
            Category(
                {ref:"bank",
                category:0,
                items:items,
                isEditor:isEditor,
                targetCategory:targetCategory,
                dragging:dragging,
                onChangeContent:self.props.onChangeContent,
                startDrag:self.startDrag}
                )
        );

        var deleteItem;
        if (isEditor) {
            var deleteItemClass = "delete-item-area";
            if (targetCategory === "delete") {
                deleteItemClass += " target";
            }
            deleteItem = React.DOM.div( {className:deleteItemClass}, 
                React.DOM.span( {className:"icon-trash"})
            );
        }

        // categories
        var categories = React.DOM.div( {className:"categories clearfix"}, 
            _.map(self.props.categoryHeaders, function(header, c) {
                var category = c + 1;
                return Category(
                            {ref:"category-" + category,
                            category:category,
                            key:category,
                            categoryHeader:header,
                            isEditor:isEditor,
                            items:items,
                            isTarget:targetCategory === category,
                            dragging:dragging,
                            showDragHint:self.state.showDragHint,
                            onChangeContent:self.props.onChangeContent,
                            onChangeHeader:self.props.onChangeHeader,
                            removeCategory:self.props.removeCategory,
                            startDrag:self.startDrag}
                            );
            })
        );

        // container
        var containerName = "draggy-boxy-thing categorization-container" +
                            " clearfix";
        if (isEditor) {
            containerName += " categorization-container-editor";
        }
        if (dragging) {
            containerName += " currently-dragging";
        }

        return React.DOM.div( {className:containerName}, 
            dragItem,
            bank,
            categories,
            deleteItem
        );
    },

    toJSON: function() {
        var items = _.map(this.props.items, function (item) {
            return _.pick(item, "location");
        });
        return {items: items};
    },

    simpleValidate: function(rubric) {
        return Categorization.validate(this.toJSON(), rubric);
    },

    focusAddedItem: function() {
        this.refs.bank.focusAddedItem();
    },

    focusAddedCategory: function() {
        var category = this.props.categoryHeaders.length;
        this.refs["category-" + category].focus();
    },
});

_.extend(Categorization, {
    validate: function(state, rubric) {
        var started = false;
        var allCorrect = true;
        _.each(state.items, function(item, i) {
            var correctLocation = rubric.correctLocations[i];
            var loc = item.location;
            if (!isBank(loc.category)) {
                started = true;
            }
            if (loc.category !== correctLocation.category) {
                allCorrect = false;
            }
        });
        if (!started) {
            return {
                type: "invalid",
                message: "At least one item must be categorized."
            };
        }
        return {
            type: "points",
            earned: allCorrect ? 1 : 0,
            total: 1,
            message: null
        };
    }
});

var Category = React.createClass({displayName: 'Category',

    renderCategoryItem: function(item, options) {
        var dragging = this.props.dragging;
        if (dragging && dragging.itemIndex === item.index) {
            return PlaceholderItem( {item:item} );
        }
        var key = "category-item-" + item.index;
        return CategoryItem({
            ref: key,
            key: key,
            item: item,
            isEditor: this.props.isEditor,
            onMouseDown: _.partial(this.props.startDrag, item.index),
            onChange: _.partial(this.props.onChangeContent, item.index)
        });
    },

    getDefaultProps: function() {
        return {
            isEditor: false,
            showDragHint: false,
            categoryHeader: null
        };
    },

    categoryItems: function() {
        var self = this;
        var colItems = _.filter(self.props.items, function(item) {
            return item.location.category === self.props.category;
        });
        return _.sortBy(colItems, function(item) {
            return item.location.position;
        });
    },

    render: function() {
        var self = this;
        var category = self.props.category;
        var items = self.categoryItems();

        var cardList = React.DOM.ul( {className:"clearfix"}, 
            _.map(items, self.renderCategoryItem, self),
            self.props.showDragHint ? DragHintItem(null ) : InvisibleItem(null )
        );

        var header = self.renderHeader();

        // container class
        var className = "category clearfix category-" + category;
        if (self.props.isTarget) {
            className += " target";
        } else if (self.props.dragging) {
            className += " non-target";
        }

        var listClass = "cards-list";
        if (!isBank(category)) {
            listClass += " cards-area";
        }

        return React.DOM.div( {className:className}, 
            React.DOM.div( {className:listClass}, 
                header,
                cardList
            )
        );
    },

    renderHeader: function() {
        var self = this;
        if (isBank(self.props.category)) {
            return null;
        }
        var header;
        if (self.props.isEditor) {
            var onChangeHeader = function(e) {
                var header = self.refs.header;
                var value = header.getDOMNode().value;
                self.props.onChangeHeader(self.props.category, value);
            };
            var removeCategory = _.partial(
                    self.props.removeCategory, self.props.category);

            header = React.DOM.div(null, 
                React.DOM.div(
                        {className:"remove",
                        onClick:removeCategory}, 
                    React.DOM.span( {className:"icon-remove"})
                ),
                React.DOM.input(
                        {ref:"header",
                        type:"text",
                        onChange:onChangeHeader,
                        value:self.props.categoryHeader}
                        )
            );
        } else {
            header = Perseus.Renderer({
                content: self.props.categoryHeader
            });
        }
        return React.DOM.div( {className:"header"}, header);
    },

    focus: function() {
        this.refs.header.getDOMNode().focus();
    },

    focusAddedItem: function() {
        var length = this.props.items.length;
        if (length) {
            var item = this.props.items[length - 1];
            var ref = this.refs["category-item-" + item.index];
            if (ref) {
                ref.focus();
            }
        }
    },
});

var PlaceholderItem = React.createClass({displayName: 'PlaceholderItem',
    render: function() {
        return React.DOM.li( {className:"card-container"}, 
            React.DOM.div( {className:"card placeholder"}, 
                Perseus.Renderer({content: this.props.item.content})
            )
        );
    }
});

var DragHintItem = React.createClass({displayName: 'DragHintItem',
    render: function() {
        return React.DOM.li( {className:"card-container"}, 
            React.DOM.div( {className:"card card-empty-slot drag-hint"})
        );
    }
});

var InvisibleItem = React.createClass({displayName: 'InvisibleItem',
    render: function() {
        return React.DOM.li( {className:"card-container"}, 
            React.DOM.div( {className:"card card-empty-slot card-hidden"})
        );
    }
});

var CategoryItem = React.createClass({displayName: 'CategoryItem',
    getDefaultProps: function() {
        return {
            onChange: function() {},
            onMouseDown: function() {},
            isEditor: false
        };
    },

    render: function() {
        var self = this;
        var item = self.props.item;
        var content = item.content;
        var isEditor = self.props.isEditor;
        var onChange = function(e) {
            self.props.onChange(self.refs.editor.getDOMNode().value);
        };
        var onMouseDown = function(e) {
            if (isEditor) {
                if (e.target.tagName === "TEXTAREA") {
                    return;
                }
            }
            self.props.onMouseDown(e);
            e.preventDefault();
        };

        var className = "card";
        if (self.props.isDragItem) {
            className += " dragging";
        }

        var inner;
        if (isEditor) {
            var mouseDownEditor = function(e) {
                e.stopPropagation();
            };
            inner = React.DOM.div(
                    {className:className + " card-editor",
                    onMouseDown:onMouseDown}, 
                React.DOM.div( {className:"drag-bar"}, 
                    React.DOM.span( {className:"icon-reorder"})
                ),
                React.DOM.input(
                        {ref:"editor",
                        type:"text",
                        onChange:onChange,
                        onMouseDown:mouseDownEditor,
                        value:content}
                        )
            );
        } else {
            inner = React.DOM.div(
                {className:className,
                onMouseDown:onMouseDown,
                onTouchStart:onMouseDown}
            , Perseus.Renderer({content: content}));
        }

        if (self.props.isDragItem) {
            return inner;
        }
        return React.DOM.li( {className:"card-container"}, 
            inner
        );
    },

    focus: function() {
        this.refs.editor.getDOMNode().focus();
    },
});

var CategorizationEditor = React.createClass({displayName: 'CategorizationEditor',
    getDefaultProps: getDefaultProps,

    render: function() {
        var self = this;
        var correctLocations = self.props.correctLocations;
        var items = _.map(self.props.items, function(item, index) {
            return {
                content: item.content,
                location: correctLocations[index]
            };
        });
        return React.DOM.div(null, 
            InfoTip(null, 
              React.DOM.p(null, "The number of cards and categories is unlimited, but we"+' '+
              "recommend a max of five cards and three categories to prevent the"+' '+
              "question from running off the screen."),

              React.DOM.p(null, "For the correct answer, move the cards into the correct"+' '+
              "categories in the question area on the left side of the"+' '+
              "screen.")
            ),
            React.DOM.div( {className:"categorization-editor-area"}, 
                React.DOM.div( {className:"add-item"}, 
                    React.DOM.button( {onClick:self.addItem}, 
                        ' ',"Add an item",' '
                    )
                ),
                React.DOM.div( {className:"add-category"}, 
                    React.DOM.button( {onClick:self.onAddCategory}, 
                        ' ',"Add a category",' '
                    )
                )
            ),
            Categorization(
                {ref:"categorization",
                items:items,
                categoryHeaders:self.props.categoryHeaders,
                isEditor:true,
                removeCategory:self.removeCategory,
                onChangeHeader:self.onChangeHeader,
                onChangeContent:self.onChangeContent,
                deleteItem:self.deleteItem,
                onChange:function(rawNewProps) {
                    var newProps = _.clone(rawNewProps);
                    if (rawNewProps.items) {
                        newProps.correctLocations = _.pluck(
                                newProps.items, "location");
                    }
                    self.props.onChange(newProps);
                }}
                )
        );
    },

    onAddCategory: function(e) {
        var headers = this.props.categoryHeaders.slice();
        headers.push("");
        this.props.onChange({
            categoryHeaders: headers
        }, this.refs.categorization.focusAddedCategory);
    },

    removeCategory: function(category) {
        var correctLocations = this.props.correctLocations;
        var headers = this.props.categoryHeaders.slice();
        var position = nextPositionCorrectLocations(correctLocations);
        correctLocations = _.map(correctLocations, function(loc) {
            if (loc.category === category) {
                position += 1;
                return {category: 0, position: position};
            } else if (loc.category > category) {
                loc = _.clone(loc);
                loc.category = loc.category - 1;
                return loc;
            } else {
                return loc;
            }
        });
        headers.splice(category - 1, 1);
        this.props.onChange({
            categoryHeaders: headers,
            correctLocations: correctLocations
        });
    },

    addItem: function() {
        var items = this.props.items.slice();
        var correctLocations = this.props.correctLocations.slice();
        var position = nextPositionCorrectLocations(correctLocations);
        var item = blankItem(position);
        items.push(item);
        correctLocations.push(item.location);
        this.props.onChange({
            items: items,
            correctLocations: correctLocations
        }, this.refs.categorization.focusAddedItem);
    },

    deleteItem: function(removeIndex) {
        var items = this.props.items.slice();
        var correctLocations = this.props.correctLocations.slice();
        items.splice(removeIndex, 1);
        correctLocations.splice(removeIndex, 1);
        this.props.onChange({
            items: items,
            correctLocations: correctLocations
        });
    },

    onChangeContent: function(itemIndex, content) {
        if (itemIndex == null) {
            return;
        }
        var items = this.props.items.slice();
        items[itemIndex] = _.extend({}, items[itemIndex], {content: content});
        this.props.onChange({items: items});
    },

    onChangeHeader: function(category, content) {
        var headers = this.props.categoryHeaders.slice();
        headers[category - 1] = content;
        this.props.onChange({categoryHeaders: headers});
    },

    focus: function() {
        this.refs.categorization.focusAddedItem();
    },

    toJSON: function() {
        var json = _.pick(this.props, "items", "correctLocations",
                          "categoryHeaders");
        json.items = _.map(json.items, function(item, index) {
            item = _.clone(item);
            delete item.index;
            item.location = {category: 0, position: index};
            return item;
        });
        return json;
    }
});

Widgets.register("categorization", Categorization);
Widgets.register("categorization-editor", CategorizationEditor);

})(Perseus);

},{"../components/info-tip.jsx":8,"../core.js":15,"../renderer.jsx":36,"../widgets.js":39}],41:[function(require,module,exports){
/** @jsx React.DOM */
(function(Perseus) {

require("../core.js");

var InfoTip = require("../components/info-tip.jsx");
var Widgets = require("../widgets.js");

var Dropdown = React.createClass({displayName: 'Dropdown',
    getDefaultProps: function() {
        return {
            choices: [{}],
            selected: 0
        };
    },

    render: function() {
        var choices = this.props.choices.slice();
        choices.unshift({
            content: ""
        });

        // TODO(jack): This should base the selected
        // item on its props
        return React.DOM.select(
                    {onChange:this.onChange,
                    className:"perseus-widget-dropdown"}, 
            choices.map(function(choice, i) {
                return React.DOM.option(
                        {key:"" + i,
                        value:i}, 
                    choice.content
                );
            }, this)
        );
    },

    focus: function() {
        this.getDOMNode().focus();
        return true;
    },

    onChange: function(e) {
        var selected = this.getDOMNode().selectedIndex;
        this.props.onChange({selected: selected});
    },

    toJSON: function(skipValidation) {
        return {value: this.getDOMNode().selectedIndex};
    },

    simpleValidate: function(rubric) {
        return Dropdown.validate(this.toJSON(), rubric);
    },
});

_.extend(Dropdown, {
    validate: function(state, rubric) {
        var selected = state.value;
        if (selected === 0) {
            return {
                type: "invalid",
                message: null
            };
        } else {
            var correct = rubric.choices[selected - 1].correct;
            return {
                type: "points",
                earned: correct ? 1 : 0,
                total: 1,
                message: null
            };
        }
    }
});

var DropdownEditor = React.createClass({displayName: 'DropdownEditor',
    getDefaultProps: function() {
        return {
            choices: [{
                content: "",
                correct: false
            }]
        };
    },

    render: function() {
        var dropdownGroupName = _.uniqueId("perseus_dropdown_");
        return React.DOM.div( {className:"perseus-widget-dropdown"}, 
            InfoTip(null, 
                React.DOM.p(null, "The drop down is useful for making inequalities in a custom"+' '+
                "format. We normally use the symbols ", "<",", ", ">",", ≤, ≥ (in"+' '+
                "that order) which you can copy into the choices.  When"+' '+
                "possible, use the \"multiple choice\" answer type"+' '+
                "instead.")
            ),
            React.DOM.ul(null, 
                this.props.choices.map(function(choice, i) {
                    return React.DOM.li( {key:"" + i}, 
                        React.DOM.div(null, 
                            React.DOM.input(
                                {ref:"radio" + i,
                                type:"radio",
                                name:dropdownGroupName,
                                checked:choice.correct ? "checked" : "",
                                onChange:this.onCorrectChange.bind(this, i),
                                value:i} ),
                            React.DOM.input(
                                {type:"text",
                                ref:"editor" + i,
                                onChange:this.onContentChange.bind(this, i),
                                value:choice.content} ),
                            React.DOM.a( {href:"#", className:"simple-button orange",
                                    onClick:this.removeChoice.bind(this, i)}, 
                                React.DOM.span( {className:"icon-trash remove-choice"} )
                            )
                        )
                    );
                }, this)
            ),

            React.DOM.div( {className:"add-choice-container"}, 
                React.DOM.a( {href:"#", className:"simple-button orange",
                        onClick:this.addChoice}, 
                    React.DOM.span( {className:"icon-plus"} ),
                    ' ',"Add a choice",' '
                )
            )
        );
    },

    onCorrectChange: function(choiceIndex) {
        var choices = _.map(this.props.choices, function (choice, i) {
            return _.extend({}, choice, {
                correct: i === choiceIndex
            });
        });
        this.props.onChange({choices: choices});
    },

    onContentChange: function(choiceIndex, e) {
        var choices = this.props.choices.slice();
        var choice = _.clone(choices[choiceIndex]);
        choice.content = e.target.value;
        choices[choiceIndex] = choice;
        this.props.onChange({choices: choices});
    },

    addChoice: function(e) {
        e.preventDefault();

        var choices = this.props.choices;
        var blankChoice = {content: "", correct: false};
        this.props.onChange({
            choices: choices.concat([blankChoice])
        }, this.focus.bind(this, choices.length));
    },

    removeChoice: function(choiceIndex, e) {
        e.preventDefault();
        var choices = _(this.props.choices).clone();
        choices.splice(choiceIndex, 1);
        this.props.onChange({
            choices: choices
        });
    },

    focus: function(i) {
        this.refs["editor" + i].getDOMNode().focus();
        return true;
    },

    toJSON: function(skipValidation) {
        if (!skipValidation &&
                !_.some(_.pluck(this.props.choices, "correct"))) {
            alert("Warning: No choice is marked as correct.");
        }
        return _.pick(this.props, 'choices');
    }
});

Widgets.register("dropdown", Dropdown);
Widgets.register("dropdown-editor", DropdownEditor);

})(Perseus);

},{"../components/info-tip.jsx":8,"../core.js":15,"../widgets.js":39}],42:[function(require,module,exports){
/** @jsx React.DOM */

/**
 * This is a simple number-entry widget
 * It is not as powerful as number-input, but has a simpler, more
 * representative structure as an example widget, and is easier to
 * test new ideas on.
 *
 * TODO(jack): Add more comments
 */

var Widgets = require("../widgets.js");
var Changeable = require("../mixins/changeable.jsx");
var JsonifyProps = require("../mixins/jsonify-props.jsx");

var knumber = KhanUtil.knumber;

var TextInput = React.createClass({displayName: 'TextInput',
    render: function() {
        return React.DOM.input(
            {ref:"input",
            value:this.props.value || "",
            onChange:this.changeValue} );
    },

    focus: function() {
        this.refs.input.focus();
        return true;
    },

    changeValue: function(e) {
        // Translating from the js event e to the value
        // of the textbox to send to onChange
        this.props.onChange(e.target.value);
    }
});

/**
 * This is the widget's renderer. It shows up in the right column
 * in test.html, and is what is visible to users, and where
 * users enter their answers.
 */
var ExampleWidget = React.createClass({displayName: 'ExampleWidget',
    propTypes: {
        value: React.PropTypes.string
    },

    getDefaultProps: function() {
        return {
            value: ""
        };
    },

    /**
     * Changeling creates this.change() to tell our parent to update our props
     *
     * JsonifyProps creates this.toJSON() which returns the state of the widget
     * for checking the answer in simpleValidate
     */
    mixins: [Changeable, JsonifyProps],

    render: function() {
        return TextInput(
            {ref:"input",
            value:this.props.value,
            onChange:this.change("value")} );
    },

    /**
     * Widgets that are focusable should add a focus method that returns
     * true if focusing succeeded. The first such widget found will be
     * focused on page load.
     */
    focus: function() {
        this.refs.input.focus();
        return true;
    },

    /**
     * simpleValidate is called for grading. Rubric is the result of calling
     * toJSON() on the editor that created this widget.
     *
     * Should return an object representing the grading result, such as
     * {
     *     type: "points",
     *     earned: 1,
     *     total: 1,
     *     message: null
     * }
     */
    simpleValidate: function(rubric) {
        return ExampleWidget.validate(this.toJSON(), rubric);
    }
});


/**
 * This is the widget's grading function
 */
_.extend(ExampleWidget, {
    /**
     * simpleValidate generally defers to this function
     *
     * state is usually the result of toJSON on the widget
     * rubric is the result of calling toJSON() on the editor
     */
    validate: function(state, rubric) {
        if (state.value === "") {
            return {
                type: "invalid",
                message: "It looks like you haven't answered all of the " +
                    "question yet."
            };
        } else if (state.value === rubric.correct) {
            return {
                type: "points",
                earned: 1,
                total: 1,
                message: null
            };
        } else {
            return {
                type: "points",
                earned: 0,
                total: 1,
                message: null
            };
        }
    }
});


/**
 * This is the widget's editor. This is what shows up on the left side
 * of the screen in test.html. Only the question writer sees this.
 */
var ExampleWidgetEditor = React.createClass({displayName: 'ExampleWidgetEditor',
    mixins: [Changeable, JsonifyProps],

    getDefaultProps: function() {
        return {
            correct: ""
        };
    },

    handleAnswerChange: function(e) {
        this.change("correct", e.target.value);
        // Could also write:
        // this.change({
        //     correct: e.target.value
        // });
    },

    render: function() {
        return React.DOM.div(null, 
            React.DOM.label(null, 
                "Correct answer:",
                React.DOM.input(
                    {value:this.props.correct,
                    onChange:this.handleAnswerChange,
                    ref:"input"} )
            )
        );
    },

    focus: function() {
        this.refs.input.focus();
        return true;
    }
});


/**
 * For this widget to work, we must register it.
 * We also must require() this file in src/all-widgets.js
 *
 * TODO(jack): Eventually make all-widgets.js do the
 * registration, and use module.exports to save the
 * renderer and editor.
 */
Widgets.register("example-widget", ExampleWidget);
Widgets.register("example-widget-editor", ExampleWidgetEditor);


},{"../mixins/changeable.jsx":33,"../mixins/jsonify-props.jsx":34,"../widgets.js":39}],43:[function(require,module,exports){
/** @jsx React.DOM */

var PropCheckBox = require("../components/prop-check-box.jsx");
var InfoTip      = require("../components/info-tip.jsx");
var TeX          = require("../tex.jsx");  // KaTeX and/or MathJax
var Util         = require("../util.js");
var Widgets      = require("../widgets.js");

var Expression = React.createClass({displayName: 'Expression',
    getDefaultProps: function() {
        return {
            currentValue: "",
            times: false,
            functions: []
        };
    },

    getInitialState: function() {
        return {
            lastParsedTex: ""
        };
    },

    parse: function(value, props) {
        // TODO(jack): Disable icu for content creators here, or
        // make it so that solution answers with ','s or '.'s work
        var options = _.pick(props || this.props, "functions");
        if (icu && icu.getDecimalFormatSymbols) {
            _.extend(options, icu.getDecimalFormatSymbols());
        }
        return KAS.parse(value, options);
    },

    componentWillMount: function() {
        this.updateParsedTex(this.props.currentValue);
    },

    componentWillReceiveProps: function(nextProps) {
        this.updateParsedTex(nextProps.currentValue, nextProps);
    },

    render: function() {
        var result = this.parse(this.props.currentValue);

        return React.DOM.span( {className:"perseus-widget-expression"}, 
            React.DOM.input( {ref:"input", type:"text",
                value:this.props.currentValue,
                onKeyDown:this.handleKeyDown,
                onKeyPress:this.handleKeyPress,
                onChange:this.handleChange} ),
            React.DOM.span( {className:"output"}, 
                React.DOM.span( {className:"tex",
                        style:{opacity: result.parsed ? 1.0 : 0.5}}, 
                    TeX(null, this.state.lastParsedTex)
                ),
                React.DOM.span( {className:"placeholder"}, 
                    React.DOM.span( {ref:"error", className:"error",
                            style:{display: "none"}}, 
                        React.DOM.span( {className:"buddy"} ),
                        React.DOM.span( {className:"message"}, React.DOM.span(null, 
                            "Sorry, I don't understand that!"
                        ))
                    )
                )
            )
        );
    },

    errorTimeout: null,

    componentDidMount: function() {
        this.componentDidUpdate();
    },

    componentDidUpdate: function() {
        clearTimeout(this.errorTimeout);
        if (this.parse(this.props.currentValue).parsed) {
            this.hideError();
        } else {
            this.errorTimeout = setTimeout(this.showError, 2000);
        }
    },

    componentWillUnmount: function() {
        clearTimeout(this.errorTimeout);
    },

    showError: function() {
        var $error = $(this.refs.error.getDOMNode());
        if (!$error.is(":visible")) {
            $error.css({ top: 50, opacity: 0.1 }).show()
                .animate({ top: 0, opacity: 1.0 }, 300);
        }
    },

    hideError: function() {
        var $error = $(this.refs.error.getDOMNode());
        if ($error.is(":visible")) {
            $error.animate({ top: 50, opacity: 0.1 }, 300, function() {
                $(this).hide();
            });
        }
    },

    /**
     * The keydown handler handles clearing the error timeout, telling
     * props.currentValue to update, and intercepting the backspace key when
     * appropriate...
     */
    handleKeyDown: function(event) {
        var input = this.refs.input.getDOMNode();
        var text = input.value;

        var start = input.selectionStart;
        var end = input.selectionEnd;
        var supported = start !== undefined;

        var which = event.nativeEvent.keyCode;

        if (supported && which === 8 /* backspace */) {
            if (start === end && text.slice(start - 1, start + 1) === "()") {
                event.preventDefault();
                var val = text.slice(0, start - 1) + text.slice(start + 1);

                // this.props.onChange will update the value for us, but
                // asynchronously, making it harder to set the selection
                // usefully, so we just set .value directly here as well.
                input.value = val;
                input.selectionStart = start - 1;
                input.selectionEnd = end - 1;
                this.props.onChange({currentValue: val});
            }
        }
    },

    /**
     * ...whereas the keypress handler handles the parentheses because keyCode
     * is more useful for actual character insertions (keypress gives 40 for an
     * open paren '(' instead of keydown which gives 57, the code for '9').
     */
    handleKeyPress: function(event) {
        var input = this.refs.input.getDOMNode();
        var text = input.value;

        var start = input.selectionStart;
        var end = input.selectionEnd;
        var supported = start !== undefined;

        var which = event.nativeEvent.charCode;

        if (supported && which === 40 /* left paren */) {
            event.preventDefault();

            var val;
            if (start === end) {
                var insertMatched = _.any([" ", ")", ""], function(val) {
                    return text.charAt(start) === val;
                });

                val = text.slice(0, start) +
                        (insertMatched ? "()" : "(") + text.slice(end);
            } else {
                val = text.slice(0, start) +
                        "(" + text.slice(start, end) + ")" + text.slice(end);
            }

            input.value = val;
            input.selectionStart = start + 1;
            input.selectionEnd = end + 1;
            this.props.onChange({currentValue: val});

        } else if (supported && which === 41 /* right paren */) {
            if (start === end && text.charAt(start) === ")") {
                event.preventDefault();
                input.selectionStart = start + 1;
                input.selectionEnd = end + 1;
            }
        }
    },

    handleChange: function(event) {
        this.props.onChange({currentValue: event.target.value});
    },

    focus: function() {
        this.refs.input.getDOMNode().focus();
        return true;
    },

    toJSON: function(skipValidation) {
        return {currentValue: this.props.currentValue};
    },

    updateParsedTex: function(value, props) {
        var result = this.parse(value, props);
        var options = _.pick(this.props, "times");
        if (result.parsed) {
            this.setState({lastParsedTex: result.expr.asTex(options)});
        }
    },

    simpleValidate: function(rubric) {
        return Expression.validate(this.toJSON(), rubric);
    },

    examples: function() {
        var mult = $._("For $2\\cdot2$, enter **2*2**");
        if (this.props.times) {
            mult = mult.replace(/\\cdot/g, "\\times");
        }

        return [
            mult,
            $._("For $3y$, enter **3y** or **3*y**"),
            $._("For $\\dfrac{1}{x}$, enter **1/x**"),
            $._("For $\\dfrac{1}{xy}$, enter **1/(xy)**"),
            $._("For $\\dfrac{2}{x + 3}$, enter **2/(x + 3)**"),
            $._("For $x^{y}$, enter **x^y**"),
            $._("For $x^{2/3}$, enter **x^(2/3)**"),
            $._("For $\\sqrt{x}$, enter **sqrt(x)**"),
            $._("For $\\pi$, enter **pi**"),
            $._("For $\\sin \\theta$, enter **sin(theta)**"),
            $._("For $\\le$ or $\\ge$, enter **<=** or **>=**"),
            $._("For $\\neq$, enter **=/=**")
        ];
    }
});

_.extend(Expression, {
    validate: function(state, rubric) {
        var options = _.clone(rubric);
        if (icu && icu.getDecimalFormatSymbols) {
            _.extend(options, icu.getDecimalFormatSymbols());
        }
        // We don't give options to KAS.parse here because that is parsing
        // the solution answer, not the student answer, and we don't
        // want a solution to work if the student is using a different
        // language but not in english.
        var val = Khan.answerTypes.expression.createValidatorFunctional(
            KAS.parse(rubric.value, rubric).expr, options);

        var result = val(state.currentValue);

        // TODO(eater): Seems silly to translate result to this invalid/points
        // thing and immediately translate it back in ItemRenderer.scoreInput()
        if (result.empty) {
            return {
                type: "invalid",
                message: result.message
            };
        } else {
            return {
                type: "points",
                earned: result.correct ? 1 : 0,
                total: 1,
                message: result.message
            };
        }
    }
});

var ExpressionEditor = React.createClass({displayName: 'ExpressionEditor',
    getDefaultProps: function() {
        return {
            form: false,
            simplify: false,
            times: false,
            functions: ["f", "g", "h"]
        };
    },

    render: function() {
        var simplifyWarning = null;
        var shouldTryToParse = this.props.simplify && this.props.value !== "";
        if (shouldTryToParse) {
            var expression = KAS.parse(this.props.value);
            if (expression.parsed && !expression.expr.isSimplified()) {
                simplifyWarning = React.DOM.p( {className:"warning"}, React.DOM.b(null, "Warning"),": You"+' '+
                    "specified that the answer should be simplified but did not"+' '+
                    "provide a simplified answer. Are you sure you want to"+' '+
                    "require simplification?");
            }
        }

        return React.DOM.div(null, 
            React.DOM.div(null, React.DOM.label(null, 
                ' ',"Correct answer:",' ',
                Expression( {ref:"expression",
                    currentValue:this.props.value,
                    times:this.props.times,
                    functions:this.props.functions,
                    onChange:function(newProps) {
                        if ("currentValue" in newProps) {
                            newProps.value = newProps.currentValue;
                            delete newProps.currentValue;
                        }
                        this.props.onChange(newProps);
                    }.bind(this)} )
            )),

            React.DOM.div(null, 
                PropCheckBox(
                    {form:this.props.form,
                    onChange:this.props.onChange,
                    labelAlignment:"right",
                    label:"Answer expression must have the same form."} ),
                InfoTip(null, 
                    React.DOM.p(null, "The student's answer must be in the same form."+' '+
                    "Commutativity and excess negative signs are ignored.")
                )
            ),

            React.DOM.div(null, 
                PropCheckBox(
                    {simplify:this.props.simplify,
                    onChange:this.props.onChange,
                    labelAlignment:"right",
                    label:"Answer expression must be fully expanded and"+' '+
                        "simplified."} ),
                InfoTip(null, 
                    React.DOM.p(null, "The student's answer must be fully expanded and"+' '+
                    "simplified. Answering this equation (x^2+2x+1) with this"+' '+
                    "factored equation (x+1)^2 will render this response"+' '+
                    "\"Your answer is not fully expanded and simplified.\"")
                )
            ),

            simplifyWarning,

            React.DOM.div(null, 
                PropCheckBox(
                    {times:this.props.times,
                    onChange:this.props.onChange,
                    labelAlignment:"right",
                    label:"Use × for rendering multiplication instead of a"+' '+
                        "center dot."} ),
                InfoTip(null, 
                    React.DOM.p(null, "For pre-algebra problems this option displays"+' '+
                    "multiplication as \\times instead of \\cdot in both the"+' '+
                    "rendered output and the acceptable formats examples.")
                )
            ),

            React.DOM.div(null, 
                React.DOM.label(null, 
                "Function variables: ",
                React.DOM.input( {type:"text",
                    defaultValue:this.props.functions.join(" "),
                    onChange:this.handleFunctions} )
                ),
                InfoTip(null, React.DOM.p(null, 
                    ' ',"Single-letter variables listed here will be"+' '+
                    "interpreted as functions. This let us know that f(x) means"+' '+
                    "\"f of x\" and not \"f times x\".",' '
                ))
            )

        );
    },

    handleCheck: function(e) {
        var newProps = {};
        newProps[e.target.name] = e.target.checked;
        this.props.onChange(newProps);
    },

    handleFunctions: function(e) {
        var newProps = {};
        newProps.functions = _.compact(e.target.value.split(/[ ,]+/));
        this.props.onChange(newProps);
    },

    focus: function() {
        this.refs.expression.focus();
        return true;
    },

    toJSON: function(skipValidation) {
        var value = this.props.value;

        if (!skipValidation) {
            if (value === "") {
                alert("Warning: No expression has been entered.");
            } else if (!this.refs.expression.parse(value).parsed) {
                alert("Warning: Entered expression didn't parse.");
            }
        }

        return _.pick(this.props, "value", "form", "simplify",
            "times", "functions");
    }
});

Widgets.register("expression", Expression);
Widgets.register("expression-editor", ExpressionEditor);


},{"../components/info-tip.jsx":8,"../components/prop-check-box.jsx":10,"../tex.jsx":37,"../util.js":38,"../widgets.js":39}],44:[function(require,module,exports){
/** @jsx React.DOM */
(function(Perseus) {

require("../core.js");
var Util = require("../util.js");

var InfoTip = require("../components/info-tip.jsx");
var Widgets = require("../widgets.js");
var BlurInput = require("../components/blur-input.jsx");

var answerTypes = {
    number: {
        name: "Numbers",
        forms: "integer, decimal, proper, improper, mixed"
    },
    decimal: {
        name: "Decimals",
        forms: "decimal"
    },
    integer: {
        name: "Integers",
        forms: "integer"
    },
    rational: {
        name: "Fractions and mixed numbers",
        forms: "integer, proper, improper, mixed"
    },
    improper: {
        name: "Improper numbers (no mixed)",
        forms: "integer, proper, improper"
    },
    mixed: {
        name: "Mixed numbers (no improper)",
        forms: "integer, proper, mixed"
    },
    percent: {
        name: "Numbers or percents",
        forms: "integer, decimal, proper, improper, mixed, percent"
    },
    pi: {
        name: "Numbers with pi", forms: "pi"
    }
};

var formExamples = {
    "integer": function(options) { return $._("an integer, like $6$"); },
    "proper": function(options) {
        if (options.simplify === "optional") {
            return $._("a *proper* fraction, like $1/2$ or $6/10$");
        } else {
            return $._("a *simplified proper* fraction, like $3/5$");
        }
    },
    "improper": function(options) {
        if (options.simplify === "optional") {
            return $._("an *improper* fraction, like $10/7$ or $14/8$");
        } else {
            return $._("a *simplified improper* fraction, like $7/4$");
        }
    },
    "mixed": function(options) {
        return $._("a mixed number, like $1\\ 3/4$");
    },
    "decimal": function(options) {
        return $._("an *exact* decimal, like $0.75$");
    },
    "percent": function(options) {
        return $._("a percent, like $12.34\\%$");
    },
    "pi": function(options) {
        return $._("a multiple of pi, like $12\\ \\text{pi}$ or " +
                "$2/3\\ \\text{pi}$");
    }
};

var InputNumber = React.createClass({displayName: 'InputNumber',
    propTypes: {
        currentValue: React.PropTypes.string
    },

    getDefaultProps: function() {
        return {
            currentValue: "",
            size: "normal"
        };
    },

    render: function() {
        return React.DOM.input( {type:"text",
            value:this.props.currentValue,
            onChange:this.handleChange,
            className:"perseus-input-size-" + this.props.size} );
    },

    handleChange: function(e) {
        this.props.onChange({ currentValue: e.target.value });
    },

    focus: function() {
        this.getDOMNode().focus();
        return true;
    },

    toJSON: function(skipValidation) {
        return {
            currentValue: this.props.currentValue
        };
    },

    simpleValidate: function(rubric) {
        return InputNumber.validate(this.toJSON(), rubric);
    },

    examples: function() {
        var type = this.props.answerType || "number";
        var forms = answerTypes[type].forms.split(/\s*,\s*/);

        var examples = _.map(forms, function(form) {
            return formExamples[form](this.props);
        }, this);

        return examples;
    }
});

_.extend(InputNumber, {
    validate: function(state, rubric) {
        if (rubric.answerType == null) {
            rubric.answerType = "number";
        }
        var val = Khan.answerTypes.number.createValidatorFunctional(
            rubric.value, {
                simplify: rubric.simplify,
                inexact: rubric.inexact || undefined,
                maxError: rubric.maxError,
                forms: answerTypes[rubric.answerType].forms
            });

        var result = val(state.currentValue);

        // TODO(eater): Seems silly to translate result to this invalid/points
        // thing and immediately translate it back in ItemRenderer.scoreInput()
        if (result.empty) {
            return {
                type: "invalid",
                message: result.message
            };
        } else {
            return {
                type: "points",
                earned: result.correct ? 1 : 0,
                total: 1,
                message: result.message
            };
        }
    }
});

var InputNumberEditor = React.createClass({displayName: 'InputNumberEditor',
    getDefaultProps: function() {
        return {
            value: "0",
            simplify: "required",
            size: "normal",
            inexact: false,
            maxError: 0.1,
            answerType: "number"
        };
    },

    handleAnswerChange: function(str) {
        var value = Util.firstNumericalParse(str) || 0;
        this.props.onChange({value: value});
    },

    render: function() {
        var answerTypeOptions = _.map(answerTypes, function(v, k) {
            return React.DOM.option( {value:k}, v.name);
        }, this);

        return React.DOM.div(null, 
            React.DOM.div(null, React.DOM.label(null, 
                ' ',"Correct answer:",' ',
                BlurInput( {value:"" + this.props.value,
                           onChange:this.handleAnswerChange,
                           ref:"input"} )
            )),

            React.DOM.div(null, 
                React.DOM.label(null, 
                    ' ',"Unsimplified answers",' ',
                    React.DOM.select( {value:this.props.simplify,
                            onChange:function(e) {
                                this.props.onChange({simplify:
                                e.target.value});
                            }.bind(this)}, 
                        React.DOM.option( {value:"required"}, "will not be graded"),
                        React.DOM.option( {value:"optional"}, "will be accepted"),
                        React.DOM.option( {value:"enforced"}, "will be marked wrong")
                    )
                ),
                InfoTip(null, 
                    React.DOM.p(null, "Normally select \"will not be graded\". This will give the"+' '+
                    "user a message saying the answer is correct but not"+' '+
                    "simplified. The user will then have to simplify it and"+' '+
                    "re-enter, but will not be penalized. (5th grade and"+' '+
                    "anything after)"),
                    React.DOM.p(null, "Select \"will be accepted\" only if the user is not"+' '+
                    "expected to know how to simplify fractions yet. (Anything"+' '+
                    "prior to 5th grade)"),
                    React.DOM.p(null, "Select \"will be marked wrong\" only if we are"+' '+
                    "specifically assessing the ability to simplify.")
                )
            ),

            React.DOM.div(null, React.DOM.label(null, 
                React.DOM.input( {type:"checkbox",
                    checked:this.props.inexact,
                    onChange:function(e) {
                        this.props.onChange({inexact: e.target.checked});
                    }.bind(this)} ),
                ' ',"Allow inexact answers",' '
            ),

            React.DOM.label(null, 
            React.DOM.input( /* TODO(emily): don't use a hidden checkbox for alignment */
                {type:"checkbox", style:{visibility: "hidden"}} ),
            ' ',"Max error:",' ',
            React.DOM.input( {type:"text", disabled:!this.props.inexact,
                defaultValue:this.props.maxError,
                onBlur:function(e) {
                    var ans = "" + (Util.firstNumericalParse(
                            e.target.value) || 0);
                    e.target.value = ans;
                    this.props.onChange({maxError: ans});
                }.bind(this)} )
            )),

            React.DOM.div(null, 
            ' ',"Answer type:",' ',
            React.DOM.select(
                {value:this.props.answerType,
                onChange:function(e) {
                    this.props.onChange({answerType: e.target.value});
                }.bind(this)}, 
                answerTypeOptions
            ),
            InfoTip(null, 
                React.DOM.p(null, "Use the default \"Numbers\" unless the answer must be in a"+' '+
                "specific form (e.g., question is about converting decimals to"+' '+
                "fractions).")
            )
            ),

            React.DOM.div(null, 
                React.DOM.label(null, 
                    ' ',"Width",' ',
                    React.DOM.select( {value:this.props.size,
                            onChange:function(e) {
                                this.props.onChange({size: e.target.value});
                            }.bind(this)}, 
                        React.DOM.option( {value:"normal"}, "Normal (80px)"),
                        React.DOM.option( {value:"small"}, "Small (40px)")
                    )
                ),
                InfoTip(null, 
                    React.DOM.p(null, "Use size \"Normal\" for all text boxes, unless there are"+' '+
                    "multiple text boxes in one line and the answer area is too"+' '+
                    "narrow to fit them.")
                )
            )
        );
    },

    focus: function() {
        this.refs.input.getDOMNode().focus();
        return true;
    },

    toJSON: function() {
        return _.pick(this.props,
                "value", "simplify", "size", "inexact", "maxError",
                "answerType");
    }
});

Widgets.register("input-number", InputNumber);
Widgets.register("input-number-editor", InputNumberEditor);

})(Perseus);

},{"../components/blur-input.jsx":4,"../components/info-tip.jsx":8,"../core.js":15,"../util.js":38,"../widgets.js":39}],45:[function(require,module,exports){
/** @jsx React.DOM */
(function(Perseus) {

require("../core.js");


var Graph         = require("../components/graph.jsx");
var GraphSettings = require("../components/graph-settings.jsx");
var InfoTip       = require("../components/info-tip.jsx");
var Interactive2  = require("../interactive2.js");
var NumberInput   = require("../components/number-input.jsx");
var Util          = require("../util.js");
var Widgets       = require("../widgets.js");

var knumber = KhanUtil.knumber;
var kpoint  = KhanUtil.kpoint;

var DeprecationMixin = Util.DeprecationMixin;


var TRASH_ICON_URI = 'https://ka-perseus-graphie.s3.amazonaws.com/b1452c0d79fd0f7ff4c3af9488474a0a0decb361.png';

var defaultBoxSize = 400;
var defaultEditorBoxSize = 340;
var defaultBackgroundImage = {
    url: null,
    scale: 1,
    bottom: 0,
    left: 0,
};

var eq = Util.eq;
var deepEq = Util.deepEq;

var UNLIMITED = "unlimited";

// Sample background image:
// https://ka-perseus-graphie.s3.amazonaws.com/29c1b0fcd17fe63df0f148fe357044d5d5c7d0bb.png

function ccw(a, b, c) {
    return (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
}

function collinear(a, b, c) {
    return eq(ccw(a, b, c), 0);
}

function sign(val) {
    if (eq(val, 0)) {
        return 0;
    } else {
        return val > 0 ? 1 : -1;
    }    
}

// default to defaultValue if actual is null or undefined
function defaultVal(actual, defaultValue) {
    return (actual == null) ? defaultValue : actual;
}

// Given rect bounding points A and B, whether point C is inside the rect
function pointInRect(a, b, c) {
    return (c[0] <= Math.max(a[0], b[0]) && c[0] >= Math.min(a[0], b[0]) &&
            c[1] <= Math.max(a[1], b[1]) && c[1] >= Math.min(a[1], b[1]));
}

// Whether line segment AB intersects line segment CD
// http://www.geeksforgeeks.org/check-if-two-given-line-segments-intersect/
function intersects(ab, cd) {
    var triplets = [
        [ab[0], ab[1], cd[0]],
        [ab[0], ab[1], cd[1]],
        [cd[0], cd[1], ab[0]],
        [cd[0], cd[1], ab[1]],
    ];

    var orientations = _.map(triplets, function(triplet) {
        return sign(ccw.apply(null, triplet));
    });

    if (orientations[0] !== orientations[1] &&
        orientations[2] !== orientations[3]) {
        return true;
    }

    for (var i = 0; i < 4; i++) {
        if (orientations[i] === 0 && pointInRect.apply(null, triplets[i])) {
            return true;
        }
    }

    return false;
}

function vector(a, b) {
    return _.map(_.zip(a, b), function(pair) {
        return pair[0] - pair[1];
    });
}

function magnitude(v) {
    return Math.sqrt(_.reduce(v, function(memo, el) {
        return memo + Math.pow(el, 2);
    }, 0));
}

function dotProduct(a, b) {
    return _.reduce(_.zip(a, b), function(memo, pair) {
        return memo + pair[0] * pair[1];
    }, 0);
}

function sideLengths(coords) {
    var segments = _.zip(coords, rotate(coords));
    return _.map(segments, function(segment) {
        return magnitude(vector.apply(null, segment));
    });
}

// Based on http://math.stackexchange.com/a/151149
function angleMeasures(coords) {
    var triplets = _.zip(rotate(coords, -1), coords, rotate(coords, 1));

    var offsets = _.map(triplets, function(triplet) {
        var p = vector(triplet[1], triplet[0]);
        var q = vector(triplet[2], triplet[1]);
        var raw = Math.acos(dotProduct(p, q) / (magnitude(p) * magnitude(q)));
        return sign(ccw.apply(null, triplet)) > 0 ? raw : -raw;
    });

    var sum = _.reduce(offsets, function(memo, arg) { return memo + arg; }, 0);

    return _.map(offsets, function(offset) {
        return sum > 0 ? Math.PI - offset : Math.PI + offset;
    });
}

// Whether two polygons are similar (or if specified, congruent)
function similar(coords1, coords2, tolerance) {
    if (coords1.length !== coords2.length) {
        return false;
    }

    var n = coords1.length;

    var angles1 = angleMeasures(coords1);
    var angles2 = angleMeasures(coords2);

    var sides1 = sideLengths(coords1);
    var sides2 = sideLengths(coords2);

    for (var i = 0; i < 2 * n; i++) {
        var angles = angles2.slice();
        var sides = sides2.slice();

        // Reverse angles and sides to allow matching reflected polygons
        if (i >= n) {
            angles.reverse();
            sides.reverse();
            // Since sides are calculated from two coordinates,
            // simply reversing results in an off by one error
            sides = rotate(sides, 1);
        }

        angles = rotate(angles, i);
        sides = rotate(sides, i);

        if (deepEq(angles1, angles)) {
            var sidePairs = _.zip(sides1, sides);

            var factors = _.map(sidePairs, function(pair) {
                return pair[0] / pair[1];
            });

            var same = _.all(factors, function(factor) {
                return eq(factors[0], factor);
            });

            var congruentEnough = _.all(sidePairs, function(pair) {
                return knumber.equal(pair[0], pair[1], tolerance);
            });

            if (same && congruentEnough) {
                return true;
            }
        }
    }

    return false;
}

// Less than or approximately equal
function leq(a, b) {
    return a < b || eq(a, b);
}

// Given triangle with sides ABC return angle opposite side C in degrees
function lawOfCosines(a, b, c) {
    return Math.acos((a * a + b * b - c * c) / (2 * a * b)) * 180 / Math.PI;
}

// e.g. rotate([1, 2, 3]) -> [2, 3, 1]
function rotate(array, n) {
    n = (typeof n === "undefined") ? 1 : (n % array.length);
    return array.slice(n).concat(array.slice(0, n));
}

function capitalize(str) {
    return str.replace(/(?:^|-)(.)/g, function(match, letter) {
        return letter.toUpperCase();
    });
}

function getLineEquation(first, second) {
    if (eq(first[0], second[0])) {
        return "x = " + first[0].toFixed(3);
    } else {
        var m = (second[1] - first[1]) /
                (second[0] - first[0]);
        var b = first[1] - m * first[0];
        return "y = " + m.toFixed(3) + "x + " + b.toFixed(3);
    }
}

// Stolen from the wikipedia article
// http://en.wikipedia.org/wiki/Line-line_intersection
function getLineIntersection(firstPoints, secondPoints) {
    var x1 = firstPoints[0][0],
        y1 = firstPoints[0][1],
        x2 = firstPoints[1][0],
        y2 = firstPoints[1][1],
        x3 = secondPoints[0][0],
        y3 = secondPoints[0][1],
        x4 = secondPoints[1][0],
        y4 = secondPoints[1][1];

    var determinant = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);

    if (Math.abs(determinant) < 1e-9) {
        return "Lines are parallel";
    } else {
        var x = ((x1 * y2 - y1 * x2) * (x3 - x4) -
                 (x1 - x2) * (x3 * y4 - y3 * x4)) / determinant;
        var y = ((x1 * y2 - y1 * x2) * (y3 - y4) -
                 (y1 - y2) * (x3 * y4 - y3 * x4)) / determinant;
        return "Intersection: (" + x.toFixed(3) + ", " + y.toFixed(3) + ")";
    }
}

function numSteps(range, step) {
    return Math.floor((range[1] - range[0]) / step);
}

var deprecatedProps = {
    showGraph: function(props) {
        return {markings: props.showGraph ? "graph" : "none"};
    }
};


var InteractiveGraph = React.createClass({displayName: 'InteractiveGraph',
    getDefaultProps: function() {
        var range = this.props.range || [[-10, 10], [-10, 10]];
        var step = this.props.step || [1, 1];
        var gridStep = this.props.gridStep ||
                   Util.getGridStep(range, step, defaultBoxSize);
        var snapStep = this.props.snapStep ||
                   Util.snapStepFromGridStep(gridStep);
        return {
            labels: ["x", "y"],
            range: range,
            box: [defaultBoxSize, defaultBoxSize],
            step: step,
            gridStep: gridStep,
            snapStep: snapStep,
            backgroundImage: defaultBackgroundImage,
            markings: "graph",
            showProtractor: false,
            showRuler: false,
            rulerLabel: "",
            rulerTicks: 10,
            graph: {
                type: "linear"
            }
        };
    },

    mixins: [DeprecationMixin],
    deprecatedProps: deprecatedProps,

    componentDidUpdate: function(prevProps, prevState) {
        var oldType = prevProps.graph.type;
        var newType = this.props.graph.type;
        if (oldType !== newType ||
                prevProps.graph.allowReflexAngles !==
                    this.props.graph.allowReflexAngles ||
                prevProps.graph.angleOffsetDeg !==
                    this.props.graph.angleOffsetDeg ||
                prevProps.graph.numPoints !== this.props.graph.numPoints ||
                prevProps.graph.numSides !== this.props.graph.numSides ||
                prevProps.graph.numSegments !== this.props.graph.numSegments ||
                prevProps.graph.showAngles !== this.props.graph.showAngles ||
                prevProps.graph.showSides !== this.props.graph.showSides ||
                prevProps.graph.snapTo !== this.props.graph.snapTo ||
                prevProps.graph.snapDegrees !== this.props.graph.snapDegrees) {
            this["remove" + capitalize(oldType) + "Controls"]();
            this["add" + capitalize(newType) + "Controls"]();
        }
        if (this.shouldResetGraphie) {
            this.resetGraphie();
        }
    },

    pointsFromNormalized: function(coordsList, noSnap) {
        var self = this;
        return _.map(coordsList, function(coords) {
            return _.map(coords, function(coord, i) {
                var range = self.props.range[i];
                if (noSnap) {
                    return range[0] + (range[1] - range[0]) * coord;
                } else {
                    var step = self.props.step[i];
                    var nSteps = numSteps(range, step);
                    var tick = Math.round(coord * nSteps);
                    return range[0] + step * tick;
                }
            });
        });
    },

    render: function() {
        var typeSelect;
        var extraOptions;
        if (this.props.flexibleType) {
            typeSelect = React.DOM.select(
                    {value:this.props.graph.type,
                    onChange:function(e) {
                        var type = e.target.value;
                        this.props.onChange({
                            graph: {type: type}
                        });
                    }.bind(this)}, 
                React.DOM.option( {value:"linear"}, "Linear function"),
                React.DOM.option( {value:"quadratic"}, "Quadratic function"),
                React.DOM.option( {value:"circle"}, "Circle"),
                React.DOM.option( {value:"point"}, "Point(s)"),
                React.DOM.option( {value:"linear-system"}, "Linear System"),
                React.DOM.option( {value:"polygon"}, "Polygon"),
                React.DOM.option( {value:"segment"}, "Line Segment(s)"),
                React.DOM.option( {value:"ray"}, "Ray"),
                React.DOM.option( {value:"angle"}, "Angle")
            );

            if (this.props.graph.type === "point") {
                extraOptions = React.DOM.select(
                        {key:"point-select",
                        value:this.props.graph.numPoints || 1,
                        onChange:function(e) {
                            // Convert numbers, leave UNLIMITED intact:
                            var num = +e.target.value || e.target.value;
                            this.props.onChange({
                                graph: {
                                    type: "point",
                                    numPoints: num,
                                    coords: null
                                }
                            });
                        }.bind(this)}, 
                    _.map(_.range(1, 7), function(n) {
                        return React.DOM.option( {value:n}, 
                            n, " point",n > 1 && "s"
                        );
                    }),
                    React.DOM.option( {value:UNLIMITED}, "unlimited")
                );
            } else if (this.props.graph.type === "polygon") {
                extraOptions = React.DOM.div(null, 
                    React.DOM.div(null, 
                        React.DOM.select(
                            {key:"polygon-select",
                            value:this.props.graph.numSides || 3,
                            onChange:function(e) {
                                // Convert numbers, leave UNLIMITED intact:
                                var num = +e.target.value || e.target.value;
                                var graph = _.extend({}, this.props.graph, {
                                    numSides: num,
                                    coords: null,
                                    snapTo: "grid" // reset the snap for
                                                   // UNLIMITED, which only
                                                   // supports "grid"
                                });
                                this.props.onChange({graph: graph});
                            }.bind(this)}, 
                            _.map(_.range(3, 13), function(n) {
                                return React.DOM.option( {value:n}, n, " sides");
                            }),
                            React.DOM.option( {value:UNLIMITED}, "unlimited sides")
                        )
                    ),
                    React.DOM.div(null, 
                        React.DOM.label(null,  " Snap to",' ',
                            React.DOM.select(
                                {key:"polygon-snap",
                                value:this.props.graph.snapTo,
                                onChange:function(e) {
                                    var graph = _.extend({}, 
                                        this.props.graph,
                                        {
                                            snapTo: e.target.value,
                                            coords: null
                                        });
                                    this.props.onChange({graph: graph});
                                }.bind(this)}, 
                                React.DOM.option( {value:"grid"}, "grid"),
                                (this.props.graph.numSides !== UNLIMITED) && [
                                    React.DOM.option( {value:"angles"}, 
                                        ' ',"interior angles",' '
                                    ),
                                    React.DOM.option( {value:"sides"}, 
                                        ' ',"side measures",' '
                                    )
                                ]
                            )
                        ),
                        InfoTip(null, 
                            React.DOM.p(null, "These options affect the movement of the vertex"+' '+
                            "points. The grid option will guide the points to"+' '+
                            "the nearest half step along the grid."),

                            React.DOM.p(null, "The interior angle and side measure options"+' '+
                            "guide the points to the nearest whole angle or"+' '+
                            "side"), " measure respectively.",' '
                        )
                    ),
                    React.DOM.div(null, 
                        React.DOM.label(null, "Show angle measures:",' ',
                            React.DOM.input( {type:"checkbox",
                                checked:this.props.graph.showAngles,
                                onChange:this.toggleShowAngles} )
                        ),
                        InfoTip(null, 
                            React.DOM.p(null, "Displays the interior angle measures.")
                        )
                    ),
                    React.DOM.div(null, 
                        React.DOM.label(null, "Show side measures:",' ',
                            React.DOM.input( {type:"checkbox",
                                checked:this.props.graph.showSides,
                                onChange:this.toggleShowSides} )
                        ),
                        InfoTip(null, 
                            React.DOM.p(null, "Displays the side lengths.")
                        )
                    )
                );
            } else if (this.props.graph.type === "segment") {
                extraOptions = React.DOM.select(
                        {key:"segment-select",
                        value:this.props.graph.numSegments || 1,
                        onChange:function(e) {
                            var num = +e.target.value;
                            this.props.onChange({
                                graph: {
                                    type: "segment",
                                    numSegments: num,
                                    coords: null
                                }
                            });
                        }.bind(this)}, 
                    _.map(_.range(1, 7), function(n) {
                        return React.DOM.option( {value:n}, 
                            n, " segment",n > 1 && "s"
                        );
                    })
                );
            } else if (this.props.graph.type === "angle") {
                var allowReflexAngles = defaultVal(
                    this.props.graph.allowReflexAngles,
                    true
                );
                extraOptions = React.DOM.div(null, 
                    React.DOM.div(null, 
                        React.DOM.label(null, "Show angle measure:",' ',
                            React.DOM.input( {type:"checkbox",
                                checked:this.props.graph.showAngles,
                                onChange:this.toggleShowAngles} )
                        )
                    ),
                    React.DOM.div(null, 
                        React.DOM.label(null, "Allow reflex angles:",' ',
                            React.DOM.input( {type:"checkbox",
                                checked:allowReflexAngles,
                                onChange:function(newVal) {
                                    this.props.onChange({
                                        graph: _.extend({}, this.props.graph, {
                                            allowReflexAngles:
                                                    !allowReflexAngles,
                                            coords: null
                                        })
                                    });
                                }.bind(this)} )
                        ),
                        InfoTip(null, 
                            React.DOM.p(null, 
                                "Reflex angles are angles with a measure"+' '+
                                "greater than 180 degrees."
                            ),
                            React.DOM.p(null, 
                                "By default, these should remain enabled."
                            )
                        )
                    ),
                    React.DOM.div(null, 
                        React.DOM.label(null, "Snap to increments of",' ',
                            NumberInput(
                                {key:"degree-snap",
                                allowEmpty:false,
                                value:this.props.graph.snapDegrees || 1,
                                onChange:function(newVal) {
                                    this.props.onChange({
                                        graph: _.extend({}, this.props.graph, {
                                            snapDegrees: Math.abs(newVal),
                                            coords: null
                                        })
                                    });
                                }.bind(this)} ),
                            ' ',"degrees",' '
                        )
                    ),
                    React.DOM.div(null, 
                        React.DOM.label(null, 
                            ' ',"With an offset of",' ',
                            NumberInput(
                                {key:"angle-offset",
                                allowEmpty:false,
                                value:this.props.graph.angleOffsetDeg || 0,
                                onChange:function(newVal) {
                                    this.props.onChange({
                                        graph: _.extend({}, this.props.graph, {
                                            angleOffsetDeg: newVal,
                                            coords: null
                                        })
                                    });
                                }.bind(this)} ),
                            ' ',"degrees",' '
                        )
                    )
                );
            }
        }

        var box = this.props.box;

        var image = this.props.backgroundImage;
        if (image.url) {
            var preScale = box[0] / defaultBoxSize;
            var scale = image.scale * preScale;
            var style = {
                bottom: (preScale * image.bottom) + "px",
                left: (preScale * image.left) + "px",
                width: (scale * image.width) + "px",
                height: (scale * image.height) + "px"
            };
            image = React.DOM.img( {style:style, src:image.url} );
        } else {
            image = null;
        }

        var onClick = this.isClickToAddPoints() ?
            this.handleAddPointsClick :
            null;

        return React.DOM.div( {className:"perseus-widget " +
                    "perseus-widget-interactive-graph",
                    style:{
                        width: box[0],
                        height: this.props.flexibleType ? "auto" : box[1]
                    }}, 
            Graph(
                {ref:"graph",
                box:this.props.box,
                labels:this.props.labels,
                range:this.props.range,
                step:this.props.step,
                gridStep:this.props.gridStep,
                snapStep:this.props.snapStep,
                markings:this.props.markings,
                backgroundImage:this.props.backgroundImage,
                showProtractor:this.props.showProtractor,
                showRuler:this.props.showRuler,
                rulerLabel:this.props.rulerLabel,
                rulerTicks:this.props.rulerTicks,
                onClick:onClick,
                onNewGraphie:this.setGraphie} ),
            typeSelect,extraOptions
        );
    },

    setGraphie: function(newGraphie) {
        this.graphie = newGraphie;
        this.setupGraphie();
    },

    handleAddPointsClick: function(coord) {
        // This function should only be called when this.isClickToAddPoints()
        // is true
        if (!this.isClickToAddPoints()) {
            throw new Error("handleAddPointsClick should not be registered" +
                "when isClickToAddPoints() is false");
        }
        if (!this.isCoordInTrash(coord)) {
            var point;
            if (this.props.graph.type === "point") {
                point = this.createPointForPointsType(
                    coord,
                    this.points.length
                );
                this.points.push(point);
                this.updateCoordsFromPoints();
            } else if (this.props.graph.type === "polygon") {
                if (this.polygon.closed) {
                    return;
                }
                point = this.createPointForPolygonType(
                    coord,
                    this.points.length
                );
                this.points.push(point);
                // We don't call updateCoordsFromPoints for
                // polygons, since the polygon won't be
                // closed yet.
                this.updatePolygon();
            }
        }
    },

    resetGraphie: function() {
        this.shouldResetGraphie = false;
        this.refs.graph.reset();
    },

    setupGraphie: function() {
        this.setTrashCanVisibility(0);
        if (this.isClickToAddPoints()) {
            this.setTrashCanVisibility(0.5);
        }

        var type = this.props.graph.type;
        this["add" + capitalize(type) + "Controls"]();
    },

    setTrashCanVisibility: function(opacity) {
        var graphie = this.graphie;

        if (knumber.equal(opacity, 0)) {
            if (this.trashCan) {
                this.trashCan.remove();
                this.trashCan = null;
            }
        } else {
            if (!this.trashCan) {
                this.trashCan = graphie.raphael.image(TRASH_ICON_URI,
                    graphie.xpixels - 40,
                    graphie.ypixels - 40,
                    40,
                    40
                );
            }
            this.trashCan.attr({
                opacity: opacity
            });
        }
    },

    componentWillReceiveProps: function(nextProps) {
        if (this.isClickToAddPoints() !== this.isClickToAddPoints(nextProps)) {
            this.shouldResetGraphie = true;
        }
    },

    isClickToAddPoints: function(props) {
        props = props || this.props;
        return (props.graph.type === "point" &&
                props.graph.numPoints === UNLIMITED) ||
               (props.graph.type === "polygon" &&
                props.graph.numSides === UNLIMITED);
    },

    getEquationString: function() {
        var type = this.props.graph.type;
        return this["get" + capitalize(type) + "EquationString"]();
    },

    addLine: function(type) {
        var self = this;
        var graphie = self.graphie;
        var coords = InteractiveGraph.getLineCoords(self.props.graph, self);

        var points = self.points = _.map(coords, function(coord)  {
            return Interactive2.addMovablePoint(graphie, {
                coord: coord,
                constraints: [
                    Interactive2.MovablePoint.constraints.bound(),
                    Interactive2.MovablePoint.constraints.snap()
                ],
                onMove: function()  {
                    var graph = _.extend({}, self.props.graph, {
                        coords: _.invoke(points, "coord")
                    });
                    self.props.onChange({graph: graph});
                },
                normalStyle: {
                    stroke: KhanUtil.BLUE,
                    fill: KhanUtil.BLUE
                }
            });
        });

        var lineConfig = {
            points: points,
            static: true
        };

        if (type === "line") {
            lineConfig.extendLine = true;
        } else if (type === "ray") {
            lineConfig.extendRay = true;
        }

        var line = self.line = Interactive2.addMovableLine(
            graphie,
            lineConfig
        );

        // A and B can't be in the same place
        points[0].listen("constraints", "isLine", function(coord)  {
            return !kpoint.equal(coord, points[1].coord());
        });
        points[1].listen("constraints", "isLine", function(coord)  {
            return !kpoint.equal(coord, points[0].coord());
        });
    },

    removeLine: function() {
        _.invoke(this.points, "remove");
        this.line.remove();
    },

    addLinearControls: function() {
        this.addLine("line");
    },

    getLinearEquationString: function() {
        var coords = InteractiveGraph.getLineCoords(this.props.graph, this);
        if (eq(coords[0][0], coords[1][0])) {
            return "x = " + coords[0][0].toFixed(3);
        } else {
            var m = (coords[1][1] - coords[0][1]) /
                    (coords[1][0] - coords[0][0]);
            var b = coords[0][1] - m * coords[0][0];
            if (eq(m, 0)) {
                return "y = " + b.toFixed(3);
            } else {
                return "y = " + m.toFixed(3) + "x + " + b.toFixed(3);
            }
        }
    },

    removeLinearControls: function() {
        this.removeLine();
    },

    defaultQuadraticCoords: function() {
        var coords = [[0.25, 0.75], [0.5, 0.25], [0.75, 0.75]];
        return this.pointsFromNormalized(coords);
    },

    addQuadraticControls: function() {
        var graphie = this.graphie;
        var coords = this.props.graph.coords;
        if (!coords) {
            coords = this.defaultQuadraticCoords();
        }

        var pointA = this.pointA = graphie.addMovablePoint({
            coord: coords[0],
            snapX: graphie.snap[0],
            snapY: graphie.snap[1],
            normalStyle: {
                stroke: KhanUtil.BLUE,
                fill: KhanUtil.BLUE
            }
        });

        var pointB = this.pointB = graphie.addMovablePoint({
            coord: coords[1],
            snapX: graphie.snap[0],
            snapY: graphie.snap[1],
            normalStyle: {
                stroke: KhanUtil.BLUE,
                fill: KhanUtil.BLUE
            }
        });

        var pointC = this.pointC = graphie.addMovablePoint({
            coord: coords[2],
            snapX: graphie.snap[0],
            snapY: graphie.snap[1],
            normalStyle: {
                stroke: KhanUtil.BLUE,
                fill: KhanUtil.BLUE
            }
        });

        // A, B, and C can't be in the same place
        pointA.onMove = function(x, y) {
            return x !== pointB.coord[0] && x !== pointC.coord[0];
        };
        pointB.onMove = function(x, y) {
            return x !== pointA.coord[0] && x !== pointC.coord[0];
        };
        pointC.onMove = function(x, y) {
            return x !== pointA.coord[0] && x !== pointB.coord[0];
        };

        this.updateQuadratic();

        $([pointA, pointB, pointC]).on("move", function() {
            var graph = _.extend({}, this.props.graph, {
                coords: [pointA.coord, pointB.coord, pointC.coord]
            });
            this.props.onChange({graph: graph});
            this.updateQuadratic();
        }.bind(this));
    },

    getQuadraticCoefficients: function() {
        // TODO(alpert): Don't duplicate
        var coords = this.props.graph.coords || this.defaultQuadraticCoords();
        return InteractiveGraph.getQuadraticCoefficients(coords);
    },

    getQuadraticEquationString: function() {
        var coeffs = this.getQuadraticCoefficients();
        return "y = " + coeffs[0].toFixed(3) + "x^2 + " +
                        coeffs[1].toFixed(3) + "x + " +
                        coeffs[2].toFixed(3);
    },

    updateQuadratic: function() {
        if (this.parabola) {
            this.parabola.remove();
        }

        var coeffs = this.getQuadraticCoefficients();
        if (!coeffs) {
            return;
        }

        var a = coeffs[0], b = coeffs[1], c = coeffs[2];
        this.parabola = this.graphie.plot(function(x) {
            return (a * x + b) * x + c;
        }, this.props.range[0]).attr({
            stroke: KhanUtil.BLUE
        });
        this.parabola.toBack();
    },

    removeQuadraticControls: function() {
        this.pointA.remove();
        this.pointB.remove();
        this.pointC.remove();
        if (this.parabola) {
            this.parabola.remove();
        }
    },

    addCircleControls: function() {
        var graphie = this.graphie;
        var minSnap = _.min(graphie.snap);

        var circle = this.circle = graphie.addCircleGraph({
            center: this.props.graph.center || [0, 0],
            radius: this.props.graph.radius || _.min(this.props.step),
            snapX: graphie.snap[0],
            snapY: graphie.snap[1],
            minRadius: minSnap * 2,
            snapRadius: minSnap
        });

        $(circle).on("move", function() {
            var graph = _.extend({}, this.props.graph, {
                center: circle.center,
                radius: circle.radius
            });
            this.props.onChange({graph: graph});
        }.bind(this));
    },

    getCircleEquationString: function() {
        var graph = this.props.graph;
        // TODO(alpert): Don't duplicate
        var center = graph.center || [0, 0];
        var radius = graph.radius || 2;
        return "center (" + center[0] + ", " + center[1] + "), radius " +
                radius;
    },

    removeCircleControls: function() {
        this.circle.remove();
    },

    addLinearSystemControls: function() {
        var graphie = this.graphie;
        var coords = InteractiveGraph.getLinearSystemCoords(this.props.graph,
            this);

        var segmentColors = [KhanUtil.BLUE, KhanUtil.GREEN];
        var points = this.points = _.map(coords,
                function(segmentCoords, segmentIndex)  {
            var segmentPoints = _.map(segmentCoords, function(coord, i)  {
                return Interactive2.addMovablePoint(graphie, {
                    coord: coord,
                    constraints: [
                        Interactive2.MovablePoint.constraints.bound(),
                        Interactive2.MovablePoint.constraints.snap(),
                        function(coord)  {
                            if (!segmentPoints) {
                                // points hasn't been defined yet because
                                // we're still creating them
                                return;
                            }
                            return !kpoint.equal(
                                coord,
                                segmentPoints[1 - i].coord()
                            );
                        }
                    ],
                    onMove: function()  {
                        var graph = _.extend({}, this.props.graph, {
                            coords: _.map(
                                this.points,
                                function(segment)  {return _.invoke(segment, "coord");}
                            )
                        });
                        this.props.onChange({graph: graph});
                    }.bind(this),
                    normalStyle: {
                        stroke: segmentColors[segmentIndex],
                        fill: segmentColors[segmentIndex]
                    }
                });
            }.bind(this));
            return segmentPoints;
        }.bind(this));

        var lines = this.lines = _.map(points,
                function(segmentPoints, segmentIndex)  {
            return Interactive2.addMovableLine(graphie, {
                points: segmentPoints,
                static: true,
                extendLine: true,
                normalStyle: {
                    stroke: segmentColors[segmentIndex]
                }
            });
        });
    },

    getLinearSystemEquationString: function() {
        var coords = InteractiveGraph.getLinearSystemCoords(this.props.graph,
            this);
        return "\n" +
            getLineEquation(coords[0][0], coords[0][1]) +
            "\n" +
            getLineEquation(coords[1][0], coords[1][1]) +
            "\n" +
            getLineIntersection(coords[0], coords[1]);
    },

    removeLinearSystemControls: function() {
        _.invoke(this.lines, "remove");
        _.map(this.points, function(segment)  {return _.invoke(segment, "remove");});
    },

    isCoordInTrash: function(coord) {
        var graphie = this.graphie;
        var screenPoint = graphie.scalePoint(coord);
        return screenPoint[0] >= graphie.xpixels - 40 &&
                screenPoint[1] >= graphie.ypixels - 40;
    },

    createPointForPointsType: function(coord, i) {
        var self = this;
        var graphie = self.graphie;
        var point = Interactive2.addMovablePoint(graphie, {
            coord: coord,
            snapX: graphie.snap[0],
            snapY: graphie.snap[1],
            constraints: [
                Interactive2.MovablePoint.constraints.bound(),
                Interactive2.MovablePoint.constraints.snap(),
                function(coord) {
                    // TODO(jack): There ought to be a
                    // MovablePoint.constraints.avoid
                    // default that lets you do things like this
                    return _.all(self.points, function(pt) {
                        return point === pt ||
                            !kpoint.equal(coord, pt.coord());
                    });
                }
            ],
            onMoveStart: function() {
                if (self.isClickToAddPoints()) {
                    self.setTrashCanVisibility(1);
                }
            },
            onMove: self.updateCoordsFromPoints,
            onMoveEnd: function(coord) {
                if (self.isClickToAddPoints()) {
                    if (self.isCoordInTrash(coord)) {
                        // remove this point from points
                        self.points = _.filter(self.points, function(pt) {
                            return pt !== point;
                        });
                        // update the correct answer box
                        self.updateCoordsFromPoints();

                        // remove this movablePoint from graphie.
                        // we wait to do this until we're not inside of
                        // said point's onMoveEnd method so its state is
                        // consistent throughout this method call
                        setTimeout(_.bind(point.remove, point), 0);
                    }
                    // In case we mouseup'd off the graphie and that
                    // stopped the move (in which case, we might not
                    // be in isCoordInTrash()
                    self.setTrashCanVisibility(0.5);
                }
            },
            normalStyle: {
                stroke: KhanUtil.BLUE,
                fill: KhanUtil.BLUE
            }
        });

        return point;
    },

    removePoint: function(point) {
        var index = null;
        this.points = _.filter(this.points, function(pt, i) {
            if (pt === point) {
                index = i;
                return false;
            } else {
                return true;
            }
        });
        return index;
    },

    createPointForPolygonType: function(coord, i) {
        var self = this;
        var graphie = this.graphie;

        // TODO(alex): check against "grid" instead, use constants
        var snapToGrid = !_.contains(["angles", "sides"],
            this.props.graph.snapTo);

        var point = graphie.addMovablePoint(_.extend({
            coord: coord,
            normalStyle: {
                stroke: KhanUtil.BLUE,
                fill: KhanUtil.BLUE
            }
        }, snapToGrid ? {
            snapX: graphie.snap[0],
            snapY: graphie.snap[1]
        } : {}
        ));

        // Index relative to current point -> absolute index
        // NOTE: This does not work when isClickToAddPoints() == true,
        // as `i` can be changed by dragging a point to the trash
        // Currently this function is only called when !isClickToAddPoints()
        function rel(j) {
            return (i + j + self.points.length) % self.points.length;
        }

        point.hasMoved = false;

        point.onMove = function(x, y) {
            var coords = _.pluck(this.points, "coord");
            coords[i] = [x, y];
            if (!kpoint.equal([x, y], point.coord)) {
                point.hasMoved = true;
            }

            // Check for invalid positioning, but only if we aren't adding
            // points one click at a time, since those added points could
            // have already violated these constraints
            if (!self.isClickToAddPoints()) {
                // Polygons can't have consecutive collinear points
                if (collinear(coords[rel(-2)], coords[rel(-1)], coords[i]) ||
                    collinear(coords[rel(-1)], coords[i],  coords[rel(1)]) ||
                    collinear(coords[i],  coords[rel(1)],  coords[rel(2)])) {
                    return false;
                }

                var segments = _.zip(coords, rotate(coords));

                if (self.points.length > 3) {
                    // Constrain to simple (non self-intersecting) polygon by
                    // testing whether adjacent segments intersect any others
                    for (var j = -1; j <= 0; j++) {
                        var segment = segments[rel(j)];
                        var others = _.without(segments,
                            segment, segments[rel(j-1)], segments[rel(j+1)]);

                        for (var k = 0; k < others.length; k++) {
                            var other = others[k];
                            if (intersects(segment, other)) {
                                return false;
                            }
                        }
                    }
                }
            }

            if (this.props.graph.snapTo === "angles" &&
                    self.points.length > 2) {
                // Snap to whole degree interior angles

                var angles = _.map(angleMeasures(coords), function(rad) {
                    return rad * 180 / Math.PI;
                });

                _.each([-1, 1], function(j) {
                    angles[rel(j)] = Math.round(angles[rel(j)]);
                });

                var getAngle = function(a, vertex, b) {
                    var angle = KhanUtil.findAngle(
                        coords[rel(a)], coords[rel(b)], coords[rel(vertex)]
                    );
                    return (angle + 360) % 360;
                };

                var innerAngles = [
                    angles[rel(-1)] - getAngle(-2, -1, 1),
                    angles[rel(1)] - getAngle(-1, 1, 2)
                ];
                innerAngles[2] = 180 - (innerAngles[0] + innerAngles[1]);

                // Avoid degenerate triangles
                if (_.any(innerAngles, function(angle) {
                            return leq(angle, 1);
                        })) {
                    return false;
                }

                var knownSide = magnitude(vector(coords[rel(-1)],
                    coords[rel(1)]));

                var onLeft = sign(ccw(
                    coords[rel(-1)], coords[rel(1)], coords[i]
                )) === 1;

                // Solve for side by using the law of sines
                var side = Math.sin(innerAngles[1] * Math.PI / 180) /
                    Math.sin(innerAngles[2] * Math.PI / 180) * knownSide;

                var outerAngle = KhanUtil.findAngle(coords[rel(1)],
                    coords[rel(-1)]);

                var offset = this.graphie.polar(
                    side,
                    outerAngle + (onLeft? 1 : -1) * innerAngles[0]
                );

                return this.graphie.addPoints(coords[rel(-1)], offset);


            } else if (this.props.graph.snapTo === "sides" &&
                    self.points.length > 1) {
                // Snap to whole unit side measures

                var sides = _.map([
                    [coords[rel(-1)], coords[i]],
                    [coords[i], coords[rel(1)]],
                    [coords[rel(-1)], coords[rel(1)]]
                ], function(coords) {
                    return magnitude(vector.apply(null, coords));
                });

                _.each([0, 1], function(j) {
                    sides[j] = Math.round(sides[j]);
                });

                // Avoid degenerate triangles
                if (leq(sides[1] + sides[2], sides[0]) ||
                        leq(sides[0] + sides[2], sides[1]) ||
                        leq(sides[0] + sides[1], sides[2])) {
                    return false;
                }

                // Solve for angle by using the law of cosines
                var innerAngle = lawOfCosines(sides[0],
                    sides[2], sides[1]);

                var outerAngle = KhanUtil.findAngle(coords[rel(1)],
                    coords[rel(-1)]);

                var onLeft = sign(ccw(
                    coords[rel(-1)], coords[rel(1)], coords[i]
                )) === 1;

                var offset = this.graphie.polar(
                    sides[0],
                    outerAngle + (onLeft ? 1 : -1) * innerAngle
                );

                return this.graphie.addPoints(coords[rel(-1)], offset);

            } else {
                // Snap to grid (already done)
                return true;
            }

        }.bind(this);

        if (self.isClickToAddPoints()) {
            point.onMoveEnd = function(x, y) {
                if (self.isCoordInTrash([x, y])) {
                    // remove this point from points
                    var index = self.removePoint(point);
                    if (self.polygon.closed) {
                        self.points = rotate(self.points, index);
                        self.polygon.closed = false;
                    }
                    self.polygon.points = self.points;
                    self.updatePolygon();
                    // the polygon is now unclosed, so we need to
                    // remove any points props
                    self.clearCoords();

                    // remove this movablePoint from graphie.
                    // we wait to do this until we're not inside of
                    // said point's onMoveEnd method so its state is
                    // consistent throughout this method call
                    setTimeout(_.bind(point.remove, point), 0);
                } else if (self.points.length > 1 && ((
                            point === self.points[0] &&
                            kpoint.equal([x, y], _.last(self.points).coord)
                        ) || (
                            point === _.last(self.points) &&
                            kpoint.equal([x, y], self.points[0].coord)
                        ))) {
                    // Join endpoints
                    var pointToRemove = self.points.pop();
                    if (self.points.length > 2) {
                        self.polygon.closed = true;
                        self.updateCoordsFromPoints();
                    } else {
                        self.polygon.closed = false;
                        self.clearCoords();
                    }
                    self.updatePolygon();
                    // remove this movablePoint from graphie.
                    // we wait to do this until we're not inside of
                    // said point's onMoveEnd method so its state is
                    // consistent throughout this method call
                    setTimeout(_.bind(pointToRemove.remove, pointToRemove), 0);
                } else {
                    var shouldRemove = _.any(self.points, function(pt) {
                        return pt !== point && kpoint.equal(pt.coord, [x, y]);
                    });
                    if (shouldRemove) {
                        self.removePoint(point);
                        self.polygon.points = self.points;
                        if (self.points.length < 3) {
                            self.polygon.closed = false;
                            self.clearCoords();
                        } else if (self.polygon.closed) {
                            self.updateCoordsFromPoints();
                        }
                        self.updatePolygon();
                        // remove this movablePoint from graphie.
                        // we wait to do this until we're not inside of
                        // said point's onMoveEnd method so its state is
                        // consistent throughout this method call
                        setTimeout(_.bind(point.remove, point), 0);
                    }
                }
                // In case we mouseup'd off the graphie and that
                // stopped the move
                self.setTrashCanVisibility(0.5);
                return true;
            };
        }

        point.isTouched = false;
        $(point.mouseTarget[0]).on("vmousedown", function() {
            if (self.isClickToAddPoints()) {
                self.setTrashCanVisibility(1);
            }
            point.isTouched = true;
        });

        $(point.mouseTarget[0]).on("vmouseup", function() {
            if (self.isClickToAddPoints()) {
                self.setTrashCanVisibility(0.5);
            }
            // If this was
            //  * a click on the first or last point
            //  * and not a drag,
            //  * and our polygon is not closed,
            //  * and we can close it (we need at least 3 points),
            // then close it
            if ((point === this.points[0] || point === _.last(this.points)) &&
                    point.isTouched &&
                    !point.hasMoved &&
                    !this.polygon.closed &&
                    this.points.length > 2) {
                this.polygon.closed = true;
                this.updatePolygon();
                // We finally have a closed polygon, so save our
                // points to props
                this.updateCoordsFromPoints();
            }
            point.isTouched = false;
            point.hasMoved = false;
        }.bind(this));

        $(point).on("move", function() {
            this.polygon.transform();
            if (this.polygon.closed) {
                this.updateCoordsFromPoints();
            }
        }.bind(this));

        return point;
    },

    updateCoordsFromPoints: function() {
        var graph = _.extend({}, this.props.graph, {
            // Handle old movable points with .coord, or
            // Interactive2.MovablePoint's with .coord()
            coords: _.map(this.points, function(point) {
                return _.result(point, "coord");
            })
        });
        this.props.onChange({graph: graph});
    },

    clearCoords: function() {
        var graph = _.extend({}, this.props.graph, {
            coords: null
        });
        this.props.onChange({graph: graph});
    },

    addPointControls: function() {
        var coords = InteractiveGraph.getPointCoords(this.props.graph, this);
        // Clear out our old points so that newly added points don't
        // "collide" with them and reposition when being added
        // Without this, when added, each point checks whether it is on top
        // of a point in this.points, which (a) shouldn't matter since
        // we're clearing out this.points anyways, and (b) can cause problems
        // if each of this.points is a MovablePoint instead of an
        // Interactive2.MovablePoint, since one has a .coord and the other
        // has .coord()
        // TODO(jack): Figure out a better way to do this
        this.points = [];
        this.points = _.map(coords, this.createPointForPointsType, this);
    },

    getPointEquationString: function() {
        var coords = InteractiveGraph.getPointCoords(this.props.graph, this);
        return coords.map(function(coord) {
            return "(" + coord[0] + ", " + coord[1] + ")";
        }).join(", ");
    },

    removePointControls: function() {
        _.invoke(this.points, "remove");
    },

    addSegmentControls: function() {
        var self = this;
        var graphie = this.graphie;

        var coords = InteractiveGraph.getSegmentCoords(this.props.graph, this);

        this.points = [];
        this.lines = _.map(coords, function(segment, i) {
            var updateCoordProps = function() {
                var graph = _.extend({}, self.props.graph, {
                    coords: _.invoke(self.lines, "coords")
                });
                self.props.onChange({graph: graph});
            };

            var points = _.map(segment, function(coord, i) {
                return Interactive2.addMovablePoint(graphie, {
                    coord: coord,
                    normalStyle: {
                        stroke: KhanUtil.BLUE,
                        fill: KhanUtil.BLUE
                    },
                    constraints: [
                        Interactive2.MovablePoint.constraints.bound(),
                        Interactive2.MovablePoint.constraints.snap(),
                        function(coord)  {
                            if (!points) {
                                // points hasn't been defined yet because
                                // we're still creating them
                                return;
                            }
                            return !kpoint.equal(coord, points[1 - i].coord());
                        }
                    ],
                    onMove: updateCoordProps
                });
            });

            self.points = self.points.concat(points);
            var line = Interactive2.addMovableLine(graphie, {
                points: points,
                static: false,
                updatePoints: true,
                constraints: [
                    Interactive2.MovableLine.constraints.bound(),
                    Interactive2.MovableLine.constraints.snap()
                ],
                onMove: updateCoordProps,
                normalStyle: {
                    stroke: KhanUtil.BLUE
                },
                highlightStyle: {
                    stroke: KhanUtil.ORANGE
                }
            });
            _.invoke(points, "toFront");

            return line;
        }, this);
    },

    removeSegmentControls: function() {
        _.invoke(this.points, "remove");
        _.invoke(this.lines, "remove");
    },

    getSegmentEquationString: function() {
        var segments = InteractiveGraph.getSegmentCoords(this.props.graph,
            this);
        return _.map(segments, function(segment) {
            return "[" +
                _.map(segment, function(coord) {
                    return "(" + coord.join(", ") + ")";
                }).join(" ") +
            "]";
        }).join(" ");
    },

    addRayControls: function() {
        this.addLine("ray");
    },

    removeRayControls: function() {
        this.removeLine();
    },

    getRayEquationString: function() {
        var coords = InteractiveGraph.getLineCoords(this.props.graph, this);
        var a = coords[0];
        var b = coords[1];
        var eq = this.getLinearEquationString();

        if (a[0] > b[0]) {
            eq += " (for x <= " + a[0].toFixed(3) + ")";
        } else if (a[0] < b[0]) {
            eq += " (for x >= " + a[0].toFixed(3) + ")";
        } else if (a[1] > b[1]) {
            eq += " (for y <= " + a[1].toFixed(3) + ")";
        } else {
            eq += " (for y >= " + a[1].toFixed(3) + ")";
        }

        return eq;
    },

    addPolygonControls: function() {
        this.polygon = null;
        var coords = InteractiveGraph.getPolygonCoords(this.props.graph, this);
        this.points = _.map(coords, this.createPointForPolygonType);
        this.updatePolygon();
    },

    updatePolygon: function() {
        var closed = this.polygon ?
            this.polygon.closed :
            !this.isClickToAddPoints();

        if (this.polygon) {
            this.polygon.remove();
        }

        var graphie = this.graphie;
        var n = this.points.length;

        // TODO(alex): check against "grid" instead, use constants
        var snapToGrid = !_.contains(["angles", "sides"],
            this.props.graph.snapTo);

        var angleLabels = _.times(n, function(i) {
            if (!this.props.graph.showAngles ||
                    (!closed && (i === 0 || i === n - 1))) {
                return "";
            } else if (this.props.graph.snapTo === "angles") {
                return "$deg0";
            } else {
                return "$deg1";
            }
        }, this);

        var showRightAngleMarkers = _.times(n, function(i) {
            return closed || (i !== 0 && i !== n - 1);
        }, this);

        var numArcs = _.times(n, function(i) {
            if (this.props.graph.showAngles &&
                    (closed || (i !== 0 && i !== n - 1))) {
                return 1;
            } else {
                return 0;
            }
        }, this);

        var sideLabels = _.times(n, function(i) {
            if (!this.props.graph.showSides ||
                (!closed && i === n - 1)) {
                return "";
            } else if (this.props.graph.snapTo === "sides") {
                return "$len0";
            } else {
                return "$len1";
            }
        }, this);

        this.polygon = graphie.addMovablePolygon(_.extend({
            closed: closed,
            points: this.points,
            angleLabels: angleLabels,
            showRightAngleMarkers: showRightAngleMarkers,
            numArcs: numArcs,
            sideLabels: sideLabels,
            updateOnPointMove: false
        }, snapToGrid ? {
            snapX: graphie.snap[0],
            snapY: graphie.snap[1]
        } : {}
        ));

        $(this.polygon).on("move", function() {
            if (this.polygon.closed) {
                this.updateCoordsFromPoints();
            }
        }.bind(this));
    },

    removePolygonControls: function() {
        _.invoke(this.points, "remove");
        this.polygon.remove();
    },

    getPolygonEquationString: function() {
        var coords = InteractiveGraph.getPolygonCoords(this.props.graph, this);
        return _.map(coords, function(coord) {
            return "(" + coord.join(", ") + ")";
        }).join(" ");
    },

    addAngleControls: function() {
        var graphie = this.graphie;

        var coords = InteractiveGraph.getAngleCoords(this.props.graph, this);

        // The vertex snaps to the grid, but the rays don't...
        this.points = _.map(coords, function(coord, i) {
            return graphie.addMovablePoint(_.extend({
                coord: coord,
                normalStyle: {
                    stroke: KhanUtil.BLUE,
                    fill: KhanUtil.BLUE
                }
            }, i === 1 ? {
                snapX: graphie.snap[0],
                snapY: graphie.snap[1]
            } : {}));
        });

        // ...they snap to whole-degree angles from the vertex.
        this.angle = graphie.addMovableAngle({
            points: this.points,
            snapDegrees: this.props.graph.snapDegrees || 1,
            snapOffsetDeg: this.props.graph.angleOffsetDeg || 0,
            angleLabel: this.props.graph.showAngles ? "$deg0" : "",
            pushOut: 2,
            allowReflex: defaultVal(this.props.graph.allowReflexAngles, true)
        });

        $(this.angle).on("move", function() {
            var graph = _.extend({}, this.props.graph, {
                coords: this.angle.getClockwiseCoords()
            });
            this.props.onChange({graph: graph});
        }.bind(this));
    },

    removeAngleControls: function() {
        _.invoke(this.points, "remove");
        this.angle.remove();
    },

    getAngleEquationString: function() {
        var coords = InteractiveGraph.getAngleCoords(this.props.graph, this);
        var angle = KhanUtil.findAngle(coords[2], coords[0], coords[1]);
        return angle.toFixed(0) + "\u00B0 angle" +
                " at (" + coords[1].join(", ") + ")";
    },

    toggleShowAngles: function() {
        var graph = _.extend({}, this.props.graph, {
            showAngles: !this.props.graph.showAngles
        });
        this.props.onChange({graph: graph});
    },

    toggleShowSides: function() {
        var graph = _.extend({}, this.props.graph, {
            showSides: !this.props.graph.showSides
        });
        this.props.onChange({graph: graph});
    },

    toJSON: function() {
        return this.props.graph;
    },

    simpleValidate: function(rubric) {
        return InteractiveGraph.validate(this.toJSON(), rubric, this);
    },

    focus: $.noop
});


_.extend(InteractiveGraph, {
    getQuadraticCoefficients: function(coords) {
        var p1 = coords[0];
        var p2 = coords[1];
        var p3 = coords[2];

        var denom = (p1[0] - p2[0]) * (p1[0] - p3[0]) * (p2[0] - p3[0]);
        if (denom === 0) {
            return;
        }
        var a = (p3[0] * (p2[1] - p1[1]) +
                 p2[0] * (p1[1] - p3[1]) +
                 p1[0] * (p3[1] - p2[1])) / denom;
        var b = ((p3[0] * p3[0]) * (p1[1] - p2[1]) +
                 (p2[0] * p2[0]) * (p3[1] - p1[1]) +
                 (p1[0] * p1[0]) * (p2[1] - p3[1])) / denom;
        var c = (p2[0] * p3[0] * (p2[0] - p3[0]) * p1[1] +
                 p3[0] * p1[0] * (p3[0] - p1[0]) * p2[1] +
                 p1[0] * p2[0] * (p1[0] - p2[0]) * p3[1]) / denom;
        return [a, b, c];
    },

    /**
     * @param {object} graph Like props.graph or props.correct
     * @param {object} component InteractiveGraph instance
     */
    getLineCoords: function(graph, component) {
        return graph.coords ||
            component.pointsFromNormalized([[0.25, 0.75], [0.75, 0.75]]);
    },

    /**
     * @param {object} graph Like props.graph or props.correct
     * @param {object} component InteractiveGraph instance
     */
    getPointCoords: function(graph, component) {
        var numPoints = graph.numPoints || 1;
        var coords = graph.coords;

        if (coords) {
            return coords;
        } else {
            switch (numPoints) {
                case 1:
                    // Back in the day, one point's coords were in graph.coord
                    coords = [graph.coord || [0, 0]];
                    break;
                case 2:
                    coords = [[-5, 0], [5, 0]];
                    break;
                case 3:
                    coords = [[-5, 0], [0, 0], [5, 0]];
                    break;
                case 4:
                    coords = [[-6, 0], [-2, 0], [2, 0], [6, 0]];
                    break;
                case 5:
                    coords = [[-6, 0], [-3, 0], [0, 0], [3, 0], [6, 0]];
                    break;
                case 6:
                    coords = [[-5, 0], [-3, 0], [-1, 0], [1, 0], [3, 0],
                              [5, 0]];
                    break;
                case UNLIMITED:
                    coords = [];
                    break;
            }
            // Transform coords from their -10 to 10 space to 0 to 1
            // because of the old graph.coord, and also it's easier.
            var range = [[-10, 10], [-10, 10]];
            coords = InteractiveGraph.normalizeCoords(coords, range);

            var coords = component.pointsFromNormalized(coords);
            return coords;
        }
    },

    /**
     * @param {object} graph Like props.graph or props.correct
     * @param {object} component InteractiveGraph instance
     */
    getLinearSystemCoords: function(graph, component) {
        return graph.coords ||
            _.map([
                [[0.25, 0.75], [0.75, 0.75]],
                [[0.25, 0.25], [0.75, 0.25]]
            ], component.pointsFromNormalized, component);
    },

    /**
     * @param {object} graph Like props.graph or props.correct
     * @param {object} component InteractiveGraph instance
     */
    getPolygonCoords: function(graph, component) {
        var coords = graph.coords;
        if (coords) {
            return coords;
        }

        var n = graph.numSides || 3;

        if (n === UNLIMITED) {
            coords = [];
        } else {
            var angle = 2 * Math.PI / n;
            var offset = (1 / n - 1 / 2) * Math.PI;

            // TODO(alex): Generalize this to more than just triangles so that
            // all polygons have whole number side lengths if snapping to sides
            var radius = graph.snapTo === "sides" ? Math.sqrt(3) / 3 * 7: 4;

            // Generate coords of a regular polygon with n sides
            coords = _.times(n, function(i) {
                return [
                    radius * Math.cos(i * angle + offset),
                    radius * Math.sin(i * angle + offset)
                ];
            });
        }

        var range = [[-10, 10], [-10, 10]];
        coords = InteractiveGraph.normalizeCoords(coords, range);

        var snapToGrid = !_.contains(["angles", "sides"], graph.snapTo);
        coords = component.pointsFromNormalized(coords,
            /* noSnap */ !snapToGrid);

        return coords;
    },

    /**
     * @param {object} graph Like props.graph or props.correct
     * @param {object} component InteractiveGraph instance
     */
    getSegmentCoords: function(graph, component) {
        var coords = graph.coords;
        if (coords) {
            return coords;
        }

        var n = graph.numSegments || 1;
        var ys = {
            1: [5],
            2: [5, -5],
            3: [5, 0, -5],
            4: [6, 2, -2, -6],
            5: [6, 3, 0, -3, -6],
            6: [5, 3, 1, -1, -3, -5],
        }[n];
        var range = [[-10, 10], [-10, 10]];

        return _.map(ys, function(y) {
            var segment = [[-5, y], [5, y]];
            segment = InteractiveGraph.normalizeCoords(segment, range);
            segment = component.pointsFromNormalized(segment);
            return segment;
        });
    },

    /**
     * @param {object} graph Like props.graph or props.correct
     * @param {object} component InteractiveGraph instance
     */
    getAngleCoords: function(graph, component) {
        var coords = graph.coords;
        if (coords) {
            return coords;
        }

        var snap = graph.snapDegrees || 1;
        var angle = snap;
        while (angle < 20) {
            angle += snap;
        }
        angle = angle * Math.PI / 180;
        var offset = (graph.angleOffsetDeg || 0) * Math.PI / 180;

        coords = component.pointsFromNormalized([
            [0.85, 0.50],
            [0.5, 0.50]
        ]);

        var radius = magnitude(vector.apply(null, coords));

        // Adjust the lower point by angleOffsetDeg degrees
        coords[0] = [
            coords[1][0] + radius * Math.cos(offset),
            coords[1][1] + radius * Math.sin(offset)
        ];
        // Position the upper point angle radians from the
        // lower point
        coords[2] = [
            coords[1][0] + radius * Math.cos(angle + offset),
            coords[1][1] + radius * Math.sin(angle + offset)
        ];

        return coords;
    },

    normalizeCoords: function(coordsList, range) {
        return _.map(coordsList, function(coords) {
            return _.map(coords, function(coord, i) {
                var extent = range[i][1] - range[i][0];
                return ((coord + range[i][1]) / extent);
            });
        });
    },

    validate: function(state, rubric, component) {
        // TODO(alpert): Because this.props.graph doesn't always have coords,
        // check that .coords exists here, which is always true when something
        // has moved
        if (state.type === rubric.correct.type && state.coords) {
            if (state.type === "linear") {
                var guess = state.coords;
                var correct = rubric.correct.coords;
                // If both of the guess points are on the correct line, it's
                // correct.
                if (collinear(correct[0], correct[1], guess[0]) &&
                        collinear(correct[0], correct[1], guess[1])) {
                    return {
                        type: "points",
                        earned: 1,
                        total: 1,
                        message: null
                    };
                }
            } else if (state.type === "linear-system") {
                var guess = state.coords;
                var correct = rubric.correct.coords;

                if ((
                        collinear(correct[0][0], correct[0][1], guess[0][0]) &&
                        collinear(correct[0][0], correct[0][1], guess[0][1]) &&
                        collinear(correct[1][0], correct[1][1], guess[1][0]) &&
                        collinear(correct[1][0], correct[1][1], guess[1][1])
                    ) || (
                        collinear(correct[0][0], correct[0][1], guess[1][0]) &&
                        collinear(correct[0][0], correct[0][1], guess[1][1]) &&
                        collinear(correct[1][0], correct[1][1], guess[0][0]) &&
                        collinear(correct[1][0], correct[1][1], guess[0][1])
                    )) {
                    return {
                        type: "points",
                        earned: 1,
                        total: 1,
                        message: null
                    };
                }

            } else if (state.type === "quadratic") {
                // If the parabola coefficients match, it's correct.
                var guessCoeffs = this.getQuadraticCoefficients(state.coords);
                var correctCoeffs = this.getQuadraticCoefficients(
                        rubric.correct.coords);
                if (deepEq(guessCoeffs, correctCoeffs)) {
                    return {
                        type: "points",
                        earned: 1,
                        total: 1,
                        message: null
                    };
                }
            } else if (state.type === "circle") {
                if (deepEq(state.center, rubric.correct.center) &&
                        eq(state.radius, rubric.correct.radius)) {
                    return {
                        type: "points",
                        earned: 1,
                        total: 1,
                        message: null
                    };
                }
            } else if (state.type === "point") {
                var guess = state.coords;
                var correct = InteractiveGraph.getPointCoords(
                        rubric.correct, component);
                guess = guess.slice();
                correct = correct.slice();
                // Everything's already rounded so we shouldn't need to do an
                // eq() comparison but _.isEqual(0, -0) is false, so we'll use
                // eq() anyway. The sort should be fine because it'll stringify
                // it and -0 converted to a string is "0"
                guess.sort();
                correct.sort();
                if (deepEq(guess, correct)) {
                    return {
                        type: "points",
                        earned: 1,
                        total: 1,
                        message: null
                    };
                }
            } else if (state.type === "polygon") {
                var guess = state.coords.slice();
                var correct = rubric.correct.coords.slice();

                var match;
                if (rubric.correct.match === "similar") {
                    match = similar(guess, correct, Number.POSITIVE_INFINITY);
                } else if (rubric.correct.match === "congruent") {
                    match = similar(guess, correct, knumber.DEFAULT_TOLERANCE);
                } else if (rubric.correct.match === "approx") {
                    match = similar(guess, correct, 0.1);
                } else { /* exact */
                    guess.sort();
                    correct.sort();
                    match = deepEq(guess, correct);
                } 

                if (match) {
                    return {
                        type: "points",
                        earned: 1,
                        total: 1,
                        message: null
                    };
                }
            } else if (state.type === "segment") {
                var guess = state.coords.slice();
                var correct = rubric.correct.coords.slice();
                guess = _.invoke(guess, "sort").sort();
                correct = _.invoke(correct, "sort").sort();
                if (deepEq(guess, correct)) {
                    return {
                        type: "points",
                        earned: 1,
                        total: 1,
                        message: null
                    };
                }
            } else if (state.type === "ray") {
                var guess = state.coords;
                var correct = rubric.correct.coords;
                if (deepEq(guess[0], correct[0]) && 
                        collinear(correct[0], correct[1], guess[1])) {
                    return {
                        type: "points",
                        earned: 1,
                        total: 1,
                        message: null
                    };
                }
            } else if (state.type === "angle") {
                var guess = state.coords;
                var correct = rubric.correct.coords;

                var match;
                if (rubric.correct.match === "congruent") {
                    var angles = _.map([guess, correct], function(coords) {
                        var angle = KhanUtil.findAngle(
                            coords[2], coords[0], coords[1]);
                        return (angle + 360) % 360;
                    });
                    match = eq.apply(null, angles);
                } else { /* exact */
                    match = deepEq(guess[1], correct[1]) && 
                            collinear(correct[1], correct[0], guess[0]) &&
                            collinear(correct[1], correct[2], guess[2]);
                }

                if (match) {
                    return {
                        type: "points",
                        earned: 1,
                        total: 1,
                        message: null
                    };
                }
            }
        }

        // The input wasn't correct, so check if it's a blank input or if it's
        // actually just wrong
        if (!state.coords || _.isEqual(state, rubric.graph)) {
            // We're where we started.
            return {
                type: "invalid",
                message: null
            };
        } else {
            return {
                type: "points",
                earned: 0,
                total: 1,
                message: null
            };
        }
    }
});

var InteractiveGraphEditor = React.createClass({displayName: 'InteractiveGraphEditor',
    className: "perseus-widget-interactive-graph",

    getDefaultProps: function() {
        var range = this.props.range || [[-10, 10], [-10, 10]];
        var step = this.props.step || [1, 1];
        var gridStep = this.props.gridStep ||
                   Util.getGridStep(range, step, defaultEditorBoxSize);
        var snapStep = this.props.snapStep ||
                   Util.snapStepFromGridStep(gridStep);
        return {
            box: [defaultEditorBoxSize, defaultEditorBoxSize],
            labels: ["x", "y"],
            range: range,
            step: step,
            gridStep: gridStep,
            snapStep: snapStep,
            valid: true,
            backgroundImage: defaultBackgroundImage,
            markings: "graph",
            showProtractor: false,
            showRuler: false,
            rulerLabel: "",
            rulerTicks: 10,
            correct: {
                type: "linear",
                coords: null
            }
        };
    },

    mixins: [DeprecationMixin],
    deprecatedProps: deprecatedProps,

    render: function() {
        var graph;
        var equationString;

        if (this.props.valid === true) {
            graph = InteractiveGraph(
                {ref:"graph",
                box:this.props.box,
                range:this.props.range,
                labels:this.props.labels,
                step:this.props.step,
                gridStep:this.props.gridStep,
                snapStep:this.props.snapStep,
                graph:this.props.correct,
                backgroundImage:this.props.backgroundImage,
                markings:this.props.markings,
                showProtractor:this.props.showProtractor,
                showRuler:this.props.showRuler,
                rulerLabel:this.props.rulerLabel,
                rulerTicks:this.props.rulerTicks,
                flexibleType:true,
                onChange:function(newProps) {
                    var correct = this.props.correct;
                    if (correct.type === newProps.graph.type) {
                        correct = _.extend({}, correct, newProps.graph);
                    } else {
                        // Clear options from previous graph
                        correct = newProps.graph;
                    }
                    this.props.onChange({correct: correct});
                }.bind(this)} );
            equationString = graph.getEquationString();
        } else {
            graph = React.DOM.div(null, this.props.valid);
        }

        return React.DOM.div( {className:"perseus-widget-interactive-graph"}, 
            React.DOM.div(null, "Correct answer",' ',
                InfoTip(null, 
                    React.DOM.p(null, "Graph the correct answer in the graph below and ensure"+' '+
                    "the equation or point coordinates displayed represent the"+' '+
                    "correct answer.")
                ),
                ' ',": ", equationString),


            GraphSettings(
                {box:this.props.box,
                range:this.props.range,
                labels:this.props.labels,
                step:this.props.step,
                gridStep:this.props.gridStep,
                snapStep:this.props.snapStep,
                valid:this.props.valid,
                backgroundImage:this.props.backgroundImage,
                markings:this.props.markings,
                showProtractor:this.props.showProtractor,
                showRuler:this.props.showRuler,
                rulerLabel:this.props.rulerLabel,
                rulerTicks:this.props.rulerTicks,
                onChange:this.props.onChange} ),


            this.props.correct.type === "polygon" &&
            React.DOM.div( {className:"type-settings"}, 
                React.DOM.label(null, 
                    ' ',"Student answer must",' ',
                    React.DOM.select(
                            {value:this.props.correct.match,
                            onChange:this.changeMatchType}, 
                        React.DOM.option( {value:"exact"}, "match exactly"),
                        React.DOM.option( {value:"congruent"}, "be congruent"),
                        React.DOM.option( {value:"approx"}, 
                            "be approximately congruent"),
                        React.DOM.option( {value:"similar"}, "be similar")
                    )
                ),
                InfoTip(null, 
                    React.DOM.ul(null, 
                        React.DOM.li(null, 
                            React.DOM.p(null, React.DOM.b(null, "Match Exactly:"), " Match exactly in size,"+' '+
                            "orientation, and location on the grid even if it is"+' '+
                            "not shown in the background.")
                        ),
                        React.DOM.li(null, 
                            React.DOM.p(null, React.DOM.b(null, "Be Congruent:"), " Be congruent in size and"+' '+
                            "shape, but can be located anywhere on the grid.")
                        ),
                        React.DOM.li(null, 
                            React.DOM.p(null, 
                                React.DOM.b(null, "Be Approximately Congruent:"), " Be exactly"+' '+
                                "similar, and congruent in size and shape to"+' '+
                                "within 0.1 units, but can be located anywhere"+' '+
                                "on the grid. ", React.DOM.em(null, "Use this with snapping to"+' '+
                                "angle measure.")
                            )
                        ),
                        React.DOM.li(null, 
                            React.DOM.p(null, React.DOM.b(null, "Be Similar:"), " Be similar with matching"+' '+
                            "interior angles, and side measures that are"+' '+
                            "matching or a multiple of the correct side"+' '+
                            "measures. The figure can be located anywhere on the"+' '+
                            "grid.")
                        )
                    )
                )
            ),
            this.props.correct.type === "angle" &&
            React.DOM.div( {className:"type-settings"}, 
                React.DOM.div(null, 
                    React.DOM.label(null, 
                        ' ',"Student answer must",' ',
                        React.DOM.select(
                                {value:this.props.correct.match,
                                onChange:this.changeMatchType}, 
                            React.DOM.option( {value:"exact"}, "match exactly"),
                            React.DOM.option( {value:"congruent"}, "be congruent")
                        )
                    ),
                    InfoTip(null, 
                        React.DOM.p(null, "Congruency requires only that the angle measures are"+' '+
                        "the same. An exact match implies congruency, but also"+' '+
                        "requires that the angles have the same orientation and"+' '+
                        "that the vertices are in the same position.")
                    )
                )
            ),
            graph
        );
    },

    changeMatchType: function(e) {
        var correct = _.extend({}, this.props.correct, {
            match: e.target.value
        });
        this.props.onChange({correct: correct});
    },

    toJSON: function() {
        var json = _.pick(this.props, "step", "backgroundImage", "markings",
            "labels", "showProtractor", "showRuler", "rulerLabel",
            "rulerTicks", "range", "gridStep", "snapStep");

        var graph = this.refs.graph;
        if (graph) {
            var correct = graph && graph.toJSON();
            _.extend(json, {
                // TODO(alpert): Allow specifying flexibleType (whether the
                // graph type should be a choice or not)
                graph: {type: correct.type},
                correct: correct
            });

            _.each(["allowReflexAngles", "angleOffsetDeg", "numPoints",
                        "numSides", "numSegments", "showAngles", "showSides",
                        "snapTo", "snapDegrees"],
                    function(key) {
                        if (_.has(correct, key)) {
                            json.graph[key] = correct[key];
                        }
                    });
        }
        return json;
    }
});

Widgets.register("interactive-graph", InteractiveGraph);
Widgets.register("interactive-graph-editor", InteractiveGraphEditor);

})(Perseus);

},{"../components/graph-settings.jsx":6,"../components/graph.jsx":7,"../components/info-tip.jsx":8,"../components/number-input.jsx":9,"../core.js":15,"../interactive2.js":24,"../util.js":38,"../widgets.js":39}],46:[function(require,module,exports){
/** @jsx React.DOM */
(function(Perseus) {

require("../core.js");
var Util = require("../util.js");
require("../widgets.js");

var InfoTip      = require("../components/info-tip.jsx");
var PropCheckBox = require("../components/prop-check-box.jsx");

function eq(x, y) {
    return Math.abs(x - y) < 1e-9;
}

var reverseRel = {
    ge: "le",
    gt: "lt",
    le: "ge",
    lt: "gt"
};

var toggleStrictRel = {
    ge: "gt",
    gt: "ge",
    le: "lt",
    lt: "le"
};

function formatImproper(n, d) {
    if (d === 1) {
        return "" + n;
    } else {
        return n + "/" + d;
    }
}

function formatMixed(n, d) {
    if (n < 0) {
        return "-" + formatMixed(-n, d);
    }
    var w = Math.floor(n / d);
    if (w === 0) {
        return formatImproper(n, d);
    } else {
        return w + "\\:" + formatImproper(n - w * d, d);
    }
}

var InteractiveNumberLine = React.createClass({displayName: 'InteractiveNumberLine',
    getDefaultProps: function() {
        return {
            labelStyle: "decimal",
            labelTicks: false,
            isInequality: false,
            pointX: 0,
            rel: "ge"
        };
    },

    isValid: function() {
        return this.props.range[0] < this.props.range[1] &&
                0 < this.props.tickStep &&
                0 < this.props.snapDivisions;
    },

    render: function() {
        var inequalityControls;
        if (this.props.isInequality) {
            inequalityControls = React.DOM.div(null, 
                React.DOM.input( {type:"button", value:"Switch direction",
                    onClick:this.handleReverse} ),
                React.DOM.input( {type:"button",
                    value:
                        this.props.rel === "le" || this.props.rel === "ge" ?
                            "Make circle open" :
                            "Make circle filled",
                        
                    onClick:this.handleToggleStrict} )
            );
        }

        var valid = this.isValid();
        return React.DOM.div( {className:"perseus-widget " +
                "perseus-widget-interactive-number-line"}, 
            React.DOM.div( {style:{display: valid ? "" : "none"},
                    className:"graphie above-scratchpad", ref:"graphieDiv"} ),
            React.DOM.div( {style:{display: valid ? "none" : ""}}, 
                ' ',"invalid number line configuration",' '
            ),
            inequalityControls
        );
    },

    handleReverse: function() {
        this.props.onChange({rel: reverseRel[this.props.rel]});
    },

    handleToggleStrict: function() {
        this.props.onChange({rel: toggleStrictRel[this.props.rel]});
    },

    componentDidMount: function() {
        this.addGraphie();
    },

    componentDidUpdate: function() {
        // Use jQuery to remove so event handlers don't leak
        var node = this.refs.graphieDiv.getDOMNode();
        $(node).children().remove();

        this.addGraphie();
    },

    _label: function(value) {
        var graphie = this.graphie;
        var labelStyle = this.props.labelStyle;

        // TODO(jack): Find out if any exercises have "decimal ticks" set,
        // and if so, re-save them and remove this check.
        if (labelStyle === "decimal" || labelStyle === "decimal ticks") {
            graphie.label([value, -0.53], value, "center");
        } else if (labelStyle === "improper") {
            var frac = KhanUtil.toFraction(value);
            graphie.label([value, -0.53],
                    formatImproper(frac[0], frac[1]), "center");
        } else if (labelStyle === "mixed") {
            var frac = KhanUtil.toFraction(value);
            graphie.label([value, -0.53],
                    formatMixed(frac[0], frac[1]), "center");
        }
    },

    addGraphie: function() {
        var self = this;
        var graphie = this.graphie = KhanUtil.createGraphie(
                this.refs.graphieDiv.getDOMNode());
        // Ensure a sane configuration to avoid infinite loops
        if (!this.isValid()) {
            return;
        }

        var range = this.props.range;
        var tickStep = this.props.tickStep;
        var scale = 400 / (range[1] - range[0]);

        graphie.init({
            range: [[range[0] - 30 / scale,
                     range[1] + 30 / scale],
                    [-1, 1]],
            scale: [scale, 40]
        });
        graphie.addMouseLayer({
            allowScratchpad: true
        });

        // Line

        graphie.line([range[0] - (25 / scale), 0],
             [range[1] + (25 / scale), 0], {
            arrows: "->"
        });
        graphie.line([range[1] + (25 / scale), 0],
             [range[0] - (25 / scale), 0], {
            arrows: "->"
        });

        // Ticks
        var labelStyle = this.props.labelStyle;
        for (var x = Math.ceil(range[0] / tickStep) * tickStep; x <= range[1];
                x += tickStep) {
            graphie.line([x, -0.2], [x, 0.2]);

            // TODO(jack): Find out if any exercises have "decimal ticks" set,
            // and if so, re-save them and remove this check.
            if (this.props.labelTicks || labelStyle === "decimal ticks") {
                this._label(x);
            }
        }

        graphie.style({
            stroke: KhanUtil.BLUE,
            strokeWidth: 3.5
        }, function() {
            graphie.line([range[0], -0.2], [range[0], 0.2]);
            graphie.line([range[1], -0.2], [range[1], 0.2]);
            if (range[0] < 0 && 0 < range[1]) {
                graphie.line([0, -0.2], [0, 0.2]);
            }
        });

        graphie.style({color: KhanUtil.BLUE}, function() {
            self._label(range[0]);
            self._label(range[1]);
            if (range[0] < 0 && 0 < range[1] && !self.props.labelTicks) {
                    graphie.label([0, -0.53], "0", "center");
            }
        });

        // Point

        var isInequality = this.props.isInequality;
        var rel = this.props.rel;

        var pointSize;
        var pointStyle;
        var highlightStyle;
        if (isInequality && (rel === "lt" || rel === "gt")) {
            pointSize = 5;
            pointStyle = {
                stroke: KhanUtil.ORANGE,
                fill: KhanUtil._BACKGROUND,
                "stroke-width": 3
            };
            highlightStyle = {
                stroke: KhanUtil.ORANGE,
                fill: KhanUtil._BACKGROUND,
                "stroke-width": 4
            };
        } else {
            pointSize = 4;
            pointStyle = highlightStyle = {
                stroke: KhanUtil.ORANGE,
                fill: KhanUtil.ORANGE
            };
        }

        var x = Math.min(Math.max(range[0], this.props.pointX), range[1]);
        var point = this.point = graphie.addMovablePoint({
            pointSize: pointSize,
            coord: [x, 0],
            snapX: this.props.tickStep / this.props.snapDivisions,
            constraints: {
                constrainY: true
            },
            normalStyle: pointStyle,
            highlightStyle: highlightStyle
        });
        point.onMove = function(x, y) {
            x = Math.min(Math.max(range[0], x), range[1]);
            updateInequality(x, y);
            return [x, y];
        };
        point.onMoveEnd = function(x, y) {
            this.props.onChange({pointX: x});
        }.bind(this);

        // Inequality line

        var inequalityLine;
        updateInequality(x, 0);

        function updateInequality(px, py) {
            if (inequalityLine) {
                inequalityLine.remove();
                inequalityLine = null;
            }
            if (isInequality) {
                var end;
                if (rel === "ge" || rel === "gt") {
                    end = [range[1] + (26 / scale), 0];
                } else {
                    end = [range[0] - (26 / scale), 0];
                }
                inequalityLine = graphie.line(
                    [px, py],
                    end,
                    {
                        arrows: "->",
                        stroke: KhanUtil.BLUE,
                        strokeWidth: 3.5
                    }
                );
                point.toFront();
            }
        }
    },

    toJSON: function() {
        return {
            pointX: this.props.pointX,
            rel: this.props.isInequality ? this.props.rel : "eq"
        };
    },

    simpleValidate: function(rubric) {
        return InteractiveNumberLine.validate(this.toJSON(), rubric);
    },

    focus: $.noop
});


_.extend(InteractiveNumberLine, {
    validate: function(state, rubric) {
        var range = rubric.range;
        var start = Math.min(Math.max(range[0], 0), range[1]);
        var startRel = rubric.isInequality ? "ge" : "eq";
        var correctRel = rubric.correctRel || "eq";

        if (eq(state.pointX, rubric.correctX || 0) &&
                correctRel === state.rel) {
            return {
                type: "points",
                earned: 1,
                total: 1,
                message: null
            };
        } else if (state.pointX === start && state.rel === startRel) {
            // We're where we started.
            return {
                type: "invalid",
                message: null
            };
        } else {
            return {
                type: "points",
                earned: 0,
                total: 1,
                message: null
            };
        }
    }
});


var InteractiveNumberLineEditor = React.createClass({displayName: 'InteractiveNumberLineEditor',
    getDefaultProps: function() {
        return {
            range: [0, 10],
            labelStyle: "decimal",
            labelTicks: false,
            tickStep: 1,
            snapDivisions: 4,
            correctRel: "eq",
            correctX: 0
        };
    },

    render: function() {
        return React.DOM.div(null, 
            React.DOM.label(null, 
                ' ',"min x: ", React.DOM.input( {defaultValue:'' + this.props.range[0],
                    onBlur:this.onRangeBlur.bind(this, 0)} )
            ),React.DOM.br(null ),
            React.DOM.label(null, 
                ' ',"max x: ", React.DOM.input( {defaultValue:'' + this.props.range[1],
                    onBlur:this.onRangeBlur.bind(this, 1)} )
            ),
            InfoTip(null, 
                React.DOM.p(null, "Change \"label styles\" below to display the max and min x in"+' '+
                "different number formats.")
            ),React.DOM.br(null ),
            React.DOM.span(null, 
                ' ',"correct:",' ',
                React.DOM.select( {value:this.props.correctRel,
                        onChange:this.onChange.bind(this, "correctRel")}, 
                    React.DOM.optgroup( {label:"Equality"}, 
                        React.DOM.option( {value:"eq"}, "x =")
                    ),
                    React.DOM.optgroup( {label:"Inequality"}, 
                        React.DOM.option( {value:"lt"}, "x <"),
                        React.DOM.option( {value:"gt"}, "x >"),
                        React.DOM.option( {value:"le"}, "x ≤"),
                        React.DOM.option( {value:"ge"}, "x ≥")
                    )
                ),
                React.DOM.input( {defaultValue:'' + this.props.correctX,
                    onBlur:this.onNumBlur.bind(this, "correctX")} )
            ),React.DOM.br(null ),React.DOM.br(null ),
            React.DOM.label(null, 
                ' ',"label style:",' ',
                React.DOM.select( {value:this.props.labelStyle,
                        onChange:this.onChange.bind(this, "labelStyle")}, 
                    React.DOM.option( {value:"decimal"}, "Decimals"),
                    React.DOM.option( {value:"improper"}, "Improper fractions"),
                    React.DOM.option( {value:"mixed"}, "Mixed numbers")
                ),
                PropCheckBox(
                    {label:"label ticks",
                    labelTicks:this.props.labelTicks,
                    onChange:this.props.onChange} )
            ),React.DOM.br(null ),
            React.DOM.label(null, 
                ' ',"tick step: ", React.DOM.input( {defaultValue:'' + this.props.tickStep,
                    onBlur:this.onNumBlur.bind(this, "tickStep")} )
            ),
            InfoTip(null, 
                React.DOM.p(null, "A tick mark is placed at every number of steps"+' '+
                "indicated.")
            ),React.DOM.br(null ),
            React.DOM.label(null, 
                ' ',"snap increments per tick:",' ',
                React.DOM.input( {defaultValue:'' + this.props.snapDivisions,
                    onBlur:this.onNumBlur.bind(this, "snapDivisions")} )
            ),
            InfoTip(null, 
                React.DOM.p(null, "Ensure the required number of snap increments is provided to"+' '+
                "answer the question.")
            )
        );
    },

    onRangeBlur: function(i, e) {
        var x = Util.firstNumericalParse(e.target.value) || 0;
        e.target.value = x;

        var range = this.props.range.slice();
        range[i] = x;
        this.props.onChange({range: range});
    },

    onChange: function(key, e) {
        var opts = {};
        opts[key] = e.target.value;
        this.props.onChange(opts);
    },

    onNumBlur: function(key, e) {
        var x = Util.firstNumericalParse(e.target.value) || 0;
        e.target.value = x;

        var opts = {};
        opts[key] = x;
        this.props.onChange(opts);
    },

    toJSON: function() {
        return {
            range: this.props.range,
            labelStyle: this.props.labelStyle,
            labelTicks: this.props.labelTicks,
            tickStep: this.props.tickStep,
            snapDivisions: this.props.snapDivisions,
            correctRel: this.props.correctRel,
            isInequality: this.props.correctRel !== "eq",
            correctX: this.props.correctX
        };
    }
});

Perseus.Widgets.register("interactive-number-line", InteractiveNumberLine);
Perseus.Widgets
    .register("interactive-number-line-editor", InteractiveNumberLineEditor);

})(Perseus);

},{"../components/info-tip.jsx":8,"../components/prop-check-box.jsx":10,"../core.js":15,"../util.js":38,"../widgets.js":39}],47:[function(require,module,exports){
/** @jsx React.DOM */
(function(Perseus) {

require("../core.js");
require("../renderer.jsx");
var Util = require("../util.js");

var shuffle = Util.shuffle;
var seededRNG = Util.seededRNG;

var InfoTip        = require("../components/info-tip.jsx");
var PropCheckBox   = require("../components/prop-check-box.jsx");
var Renderer       = Perseus.Renderer;
var Sortable       = require("../components/sortable.jsx");
var TextListEditor = require("../components/text-list-editor.jsx");
var Widgets        = require("../widgets.js");


var Matcher = React.createClass({displayName: 'Matcher',
    propTypes: {
        left: React.PropTypes.array,
        right: React.PropTypes.array,
        labels: React.PropTypes.array,
        orderMatters: React.PropTypes.bool,
        padding: React.PropTypes.bool,
        problemNum: React.PropTypes.number,
        onChange: React.PropTypes.func
    },

    getDefaultProps: function() {
        return {
            left: [],
            right: [],
            labels: ["", ""],
            orderMatters: true,
            padding: true,
            problemNum: 0,
            onChange: function() {}
        };
    },

    getInitialState: function() {
        return {
            heights: {left: 0, right: 0}
        };
    },

    render: function() {
        // Use the same random() function to shuffle both columns sequentially
        var rng = seededRNG(this.props.problemNum);

        var left;
        if (!this.props.orderMatters) {
            // If the order doesn't matter, don't shuffle the left column
            left = this.props.left;
        } else {
            left = shuffle(this.props.left, rng, /* ensurePermuted */ true);
        }

        var right = shuffle(this.props.right, rng, /* ensurePermuted */ true);

        var showLabels = _.any(this.props.labels);
        var constraints = {height: _.max(this.state.heights)};

        return React.DOM.div( {className:"perseus-widget-matcher ui-helper-clearfix"}, 
            React.DOM.div( {className:"column"}, 
                showLabels && React.DOM.div( {className:"column-label"}, 
                    Renderer( {content:this.props.labels[0] || "..."} )
                ),
                Sortable(
                    {options:left,
                    layout:"vertical",
                    padding:this.props.padding,
                    disabled:!this.props.orderMatters,
                    constraints:constraints,
                    onMeasure:_.partial(this.onMeasure, "left"),
                    onChange:this.props.onChange,
                    ref:"left"} )
            ),
            React.DOM.div( {className:"column"}, 
                showLabels && React.DOM.div( {className:"column-label"}, 
                    Renderer( {content:this.props.labels[1] || "..."} )
                ),
                Sortable(
                    {options:right,
                    layout:"vertical",
                    padding:this.props.padding,
                    constraints:constraints,
                    onMeasure:_.partial(this.onMeasure, "right"),
                    onChange:this.props.onChange,
                    ref:"right"} )
            )
        );
    },

    onMeasure: function(side, dimensions) {
        var heights = _.clone(this.state.heights);
        heights[side] = _.max(dimensions.heights);
        this.setState({heights: heights});
    },

    toJSON: function(skipValidation) {
        return {
            left: this.refs.left.getOptions(),
            right: this.refs.right.getOptions()
        };
    },

    simpleValidate: function(rubric) {
        return Matcher.validate(this.toJSON(), rubric);
    },
});


_.extend(Matcher, {
    validate: function(state, rubric) {
        var correct = _.isEqual(state.left, rubric.left) &&
                      _.isEqual(state.right, rubric.right);

        return {
            type: "points",
            earned: correct ? 1 : 0,
            total: 1,
            message: null
        };
    }
});


var MatcherEditor = React.createClass({displayName: 'MatcherEditor',
    propTypes: {
        left: React.PropTypes.array,
        right: React.PropTypes.array,
        labels: React.PropTypes.array,
        orderMatters: React.PropTypes.bool,
        padding: React.PropTypes.bool
    },

    getDefaultProps: function() {
        return {
            left: ["$x$", "$y$", "$z$"],
            right: ["$1$", "$2$", "$3$"],
            labels: ["test", "label"],
            orderMatters: true,
            padding: true
        };
    },

    render: function() {
        return React.DOM.div( {className:"perseus-matcher-editor"}, 
            React.DOM.div(null, 
                ' ',"Correct answer:",' ',
                InfoTip(null, 
                    React.DOM.p(null, "Enter the correct answers here. The preview on the right"+' '+
                    "will show the cards in a randomized order, which is how the"+' '+
                    "student will see them.")
                )
            ),
            React.DOM.div( {className:"ui-helper-clearfix"}, 
                TextListEditor(
                    {options:this.props.left,
                    onChange:function(options, cb) {
                        this.props.onChange({left: options}, cb);
                    }.bind(this),
                    layout:"vertical"} ),
                TextListEditor(
                    {options:this.props.right,
                    onChange:function(options, cb) {
                        this.props.onChange({right: options}, cb);
                    }.bind(this),
                    layout:"vertical"} )
            ),
            React.DOM.span(null, 
                ' ',"Labels:",' ',
                InfoTip(null, 
                    React.DOM.p(null, "These are entirely optional.")
                )
            ),
            React.DOM.div(null, 
                React.DOM.input( {type:"text",
                    defaultValue:this.props.labels[0],
                    onChange:_.bind(this.onLabelChange, this, 0)} ),
                React.DOM.input( {type:"text",
                    defaultValue:this.props.labels[1],
                    onChange:_.bind(this.onLabelChange, this, 1)} )
            ),
            React.DOM.div(null, 
                PropCheckBox(
                    {label:"Order of the matched pairs matters:",
                    orderMatters:this.props.orderMatters,
                    onChange:this.props.onChange} ),
                InfoTip(null, 
                    React.DOM.p(null, "With this option enabled, only the order provided above"+' '+
                    "will be treated as correct. This is useful when ordering is"+' '+
                    "significant, such as in the context of a proof."),
                    React.DOM.p(null, "If disabled, pairwise matching is sufficient. To make"+' '+
                    "this clear, the left column becomes fixed in the provided"+' '+
                    "order and only the cards in the right column can be"+' '+
                    "moved.")
                )
            ),
            React.DOM.div(null, 
                PropCheckBox(
                    {label:"Padding:",
                    padding:this.props.padding,
                    onChange:this.props.onChange} ),
                InfoTip(null, 
                    React.DOM.p(null, "Padding is good for text, but not needed for images.")
                )
            )
        );
    },

    onLabelChange: function(index, e) {
        var labels = _.clone(this.props.labels);
        labels[index] = e.target.value;
        this.props.onChange({labels: labels});
    },

    toJSON: function(skipValidation) {
        if (!skipValidation) {
            if (this.props.left.length !== this.props.right.length) {
                alert("Warning: The two halves of the matcher have different" +
                    " numbers of cards.");
            }
        }

        return _.pick(this.props,
            "left", "right", "labels", "orderMatters", "padding"
        );
    }
});

Widgets.register("matcher", Matcher);
Widgets.register("matcher-editor", MatcherEditor);

})(Perseus);

},{"../components/info-tip.jsx":8,"../components/prop-check-box.jsx":10,"../components/sortable.jsx":12,"../components/text-list-editor.jsx":13,"../core.js":15,"../renderer.jsx":36,"../util.js":38,"../widgets.js":39}],48:[function(require,module,exports){
/** @jsx React.DOM */
(function(Perseus) {

require("../core.js");

var InfoTip =       require("../components/info-tip.jsx");
var NumberInput =   require("../components/number-input.jsx");
var Widgets =       require("../widgets.js");

var Measurer = React.createClass({displayName: 'Measurer',
    getDefaultProps: function() {
        return {
            width: 480,
            height: 480,
            imageUrl: null,
            imageTop: 0,
            imageLeft: 0,
            showProtractor: true,
            protractorX: 7.5,
            protractorY: 0.5,
            showRuler: false,
            rulerX: 6.0,
            rulerY: 6.0,
            rulerLabel: "",
            rulerTicks: 10,
            rulerPixels: 40,
            rulerLength: 10
        };
    },

    getInitialState: function() {
        return {};
    },

    render: function() {
        return React.DOM.div(
                {className:
                    "perseus-widget perseus-widget-measurer " +
                    "graphie-container above-scratchpad",
                
                style:{width: this.props.width, height: this.props.height}}, 
            this.props.imageUrl &&
                React.DOM.img(
                    {src:this.props.imageUrl,
                    style:{
                        top: this.props.imageTop + "px",
                        left: this.props.imageLeft + "px"
                    }} ),
            
            React.DOM.div( {className:"graphie", ref:"graphieDiv"} )
        );
    },

    componentDidMount: function() {
        this.setupGraphie();
    },

    componentDidUpdate: function(prevProps) {
        var shouldSetupGraphie = _.any([
                "showProtractor", "showRuler", "rulerLabel", "rulerTicks",
                "rulerPixels", "rulerLength"
            ],
            function(prop) {
                return prevProps[prop] !== this.props[prop];
            },
            this
        );

        if (shouldSetupGraphie) {
            this.setupGraphie();
        }
    },

    setupGraphie: function() {
        var graphieDiv = this.refs.graphieDiv.getDOMNode();
        $(graphieDiv).empty();
        var graphie = this.graphie = KhanUtil.createGraphie(graphieDiv);

        graphie.init({
            range: [[0, this.props.width / 40], [0, this.props.height / 40]]
        });
        graphie.addMouseLayer({
            allowScratchpad: true
        });

        if (this.protractor) {
            this.protractor.remove();
        }

        if (this.props.showProtractor) {
            this.protractor = graphie.protractor([
                this.props.protractorX,
                this.props.protractorY
            ]);
        }

        if (this.ruler) {
            this.ruler.remove();
        }

        if (this.props.showRuler) {
            this.ruler = graphie.ruler({
                center: [
                    this.props.rulerX,
                    this.props.rulerY
                ],
                label: this.props.rulerLabel,
                pixelsPerUnit: this.props.rulerPixels,
                ticksPerUnit: this.props.rulerTicks,
                units: this.props.rulerLength
            });
        }
    },

    toJSON: function() {
        return {};
    },

    simpleValidate: function(rubric) {
        return Measurer.validate(this.toJSON(), rubric);
    },

    focus: $.noop
});


_.extend(Measurer, {
    validate: function(state, rubric) {
        return {
            type: "points",
            earned: 1,
            total: 1,
            message: null
        };
    }
});


var MeasurerEditor = React.createClass({displayName: 'MeasurerEditor',
    className: "perseus-widget-measurer",

    getDefaultProps: function() {
        return {
            imageUrl: null,
            imageTop: 0,
            imageLeft: 0,
            showProtractor: true,
            showRuler: false,
            rulerLabel: "",
            rulerTicks: 10,
            rulerPixels: 40,
            rulerLength: 10
        };
    },

    render: function() {
        return React.DOM.div( {className:"perseus-widget-measurer"}, 
            React.DOM.div(null, "Image displayed under protractor and/or ruler:"),
            React.DOM.div(null, "URL:",' ',
                React.DOM.input( {type:"text",
                        className:"perseus-widget-measurer-url",
                        ref:"image-url",
                        defaultValue:this.props.imageUrl,
                        onKeyPress:this.changeImageUrl,
                        onBlur:this.changeImageUrl} ),
            InfoTip(null, 
                React.DOM.p(null, "Create an image in graphie, or use the \"Add image\" function"+' '+
                "to create a background.")
            )
            ),
            this.props.imageUrl && React.DOM.div(null, 
                React.DOM.div(null, "Pixels from top:",' ',
                    NumberInput(
                        {allowEmpty:false,
                        onChange:_.partial(this.changeSetting, "imageTop"),
                        value:this.props.imageTop} )
                ),
                React.DOM.div(null, "Pixels from left:",' ',
                    NumberInput(
                        {allowEmpty:false,
                        onChange:_.partial(this.changeSetting, "imageLeft"),
                        value:this.props.imageLeft} )
                )
            ),
            React.DOM.div(null, 
                React.DOM.label(null, 
                    ' ',"Show protractor:",' ',
                    React.DOM.input( {type:"checkbox",
                        checked:this.props.showProtractor,
                        onChange:this.toggleShowProtractor} )
                )
            ),
            React.DOM.div(null, 
                React.DOM.label(null, 
                    ' ',"Show ruler:",' ',
                    React.DOM.input( {type:"checkbox",
                        checked:this.props.showRuler,
                        onChange:this.toggleShowRuler} )
                )
            ),
            this.props.showRuler && React.DOM.div(null, 
            React.DOM.div(null, 
                React.DOM.label(null, 
                    ' ',"Ruler label:",' ',
                    React.DOM.select(
                        {onChange:this.changeRulerLabel,
                        value:this.props.rulerLabel} , 
                            React.DOM.option( {value:""}, "None"),
                            React.DOM.optgroup( {label:"Metric"}, 
                                this.renderLabelChoices([
                                    ["milimeters", "mm"],
                                    ["centimeters", "cm"],
                                    ["meters", "m"],
                                    ["kilometers", "km"]
                                ])
                            ),
                            React.DOM.optgroup( {label:"Imperial"}, 
                                this.renderLabelChoices([
                                    ["inches", "in"],
                                    ["feet", "ft"],
                                    ["yards", "yd"],
                                    ["miles", "mi"]
                                ])
                            )
                    )
                )
            ),
            React.DOM.div(null, 
                React.DOM.label(null, 
                    ' ',"Ruler ticks:",' ',
                    React.DOM.select(
                        {onChange:_.partial(this.changeSetting, "rulerTicks"),
                        value:this.props.rulerTicks} , 
                            _.map([1, 2, 4, 8, 10, 16], function(n) {
                                return React.DOM.option( {value:n}, n);
                            })
                    )
                )
            ),
            React.DOM.div(null, 
                React.DOM.label(null, 
                    ' ',"Ruler pixels per unit:",' ',
                    NumberInput(
                        {allowEmpty:false,
                        onChange:_.partial(this.changeSetting, "rulerPixels"),
                        value:this.props.rulerPixels} )
                )
            ),
            React.DOM.div(null, 
                React.DOM.label(null, 
                    ' ',"Ruler length in units:",' ',
                    NumberInput(
                        {allowEmpty:false,
                        onChange:_.partial(this.changeSetting, "rulerLength"),
                        value:this.props.rulerLength} )
                )
            )
            )
        );
    },

    renderLabelChoices: function(choices) {
        return _.map(choices, function(nameAndValue) {
            return React.DOM.option( {value:nameAndValue[1]}, nameAndValue[0]);
        });
    },

    changeImageUrl: function(e) {
        // Only continue on blur or "enter"
        if (e.type === "keypress" && e.keyCode !== 13) {
            return;
        }

        this.props.onChange({
            imageUrl: this.refs["image-url"].getDOMNode().value
        });
    },

    changeRulerLabel: function(e) {
        this.props.onChange({rulerLabel: e.target.value});
    },

    changeSetting: function(type, e) {
        var newProps = {};
        newProps[type] = e.target ? +e.target.value : e;
        this.props.onChange(newProps);
    },

    toggleShowProtractor: function() {
        this.props.onChange({showProtractor: !this.props.showProtractor});
    },

    toggleShowRuler: function() {
        this.props.onChange({showRuler: !this.props.showRuler});
    },

    toJSON: function() {
        return _.pick(this.props, "imageUrl", "imageTop", "imageLeft",
            "showProtractor", "showRuler", "rulerLabel", "rulerTicks",
            "rulerPixels", "rulerLength");
    }
});

Widgets.register("measurer", Measurer);
Widgets.register("measurer-editor", MeasurerEditor);

// This widget was originally called "Protractor"
Widgets.register("protractor", Measurer);
Widgets.register("protractor-editor", MeasurerEditor);

})(Perseus);

},{"../components/info-tip.jsx":8,"../components/number-input.jsx":9,"../core.js":15,"../widgets.js":39}],49:[function(require,module,exports){
/** @jsx React.DOM */

require("../core.js");
var Util         = require("../util.js");
var Widgets      = require("../widgets.js");

var InfoTip      = require("../components/info-tip.jsx");
var PropCheckBox = require("../components/prop-check-box.jsx");
var NumberInput = require("../components/number-input.jsx");
var RangeInput   = require("../components/range-input.jsx");
var ButtonGroup  = require("../components/button-group.jsx");
var Interactive2 = require("../interactive2.js");

var eq = KhanUtil.knumber.equal;
var deepEq = Util.deepEq;
var bound = function(x, gt, lt)  {return Math.min(Math.max(x, gt), lt);};

var reverseRel = {
    ge: "le",
    gt: "lt",
    le: "ge",
    lt: "gt"
};

var toggleStrictRel = {
    ge: "gt",
    gt: "ge",
    le: "lt",
    lt: "le"
};

function formatImproper(n, d) {
    if (d === 1) {
        return "" + n;
    } else {
        return n + "/" + d;
    }
}

function formatMixed(n, d) {
    if (n < 0) {
        return "-" + formatMixed(-n, d);
    }
    var w = Math.floor(n / d);
    if (w === 0) {
        return formatImproper(n, d);
    } else {
        return w + "\\:" + formatImproper(n - w * d, d);
    }
}

var NumberLine = React.createClass({displayName: 'NumberLine',
    propTypes: {
        correctX: React.PropTypes.number,
        correctRel: React.PropTypes.string,
        initialX: React.PropTypes.number,
        range: React.PropTypes.array,

        labelsRange: React.PropTypes.array,
        labelStyle: React.PropTypes.string,
        labelTicks: React.PropTypes.bool,

        divisionRange: React.PropTypes.array,
        numDivisions: React.PropTypes.number,
        tickStep: React.PropTypes.number,
        snapDivisions: React.PropTypes.number,

        isTickCtrl: React.PropTypes.bool,
        isInequality: React.PropTypes.bool,

        numLinePosition: React.PropTypes.number,
    },

    getDefaultProps: function() {
        return {
            range: [0, 10],
            initialX: 0,
            labelStyle: "decimal",
            labelRange: [null, null],
            divisionRange: [1, 10],
            labelTicks: true,
            isTickCtrl: false,
            isInequality: false,
            numLinePosition: 0,
            snapDivisions: 2,
            rel: "ge"
        };
    },

    isValid: function() {
        var range = this.props.range;
        var initialX = this.props.initialX;
        var divisionRange = this.props.divisionRange;

        initialX = initialX == null ? range[0] : initialX;

        return range[0] <  range[1] &&
               initialX >= range[0] &&
               initialX <= range[1] &&
               divisionRange[0] < divisionRange[1] &&
               (0 < this.props.numDivisions || 0 < this.props.tickStep) &&
               0 < this.props.snapDivisions;
    },

    render: function() {
        var inequalityControls = React.DOM.div(null, 
            React.DOM.input( {type:"button", className:"simple-button",
                value:"Switch direction", onClick:this.handleReverse} ),
            React.DOM.input( {type:"button", className:"simple-button",
                value:_(["le", "ge"]).contains(this.props.rel) ?
                        "Make circle open" :
                        "Make circle filled",
                onClick:this.handleToggleStrict} )
        );

        return React.DOM.div( {className:"perseus-widget " +
                "perseus-widget-interactive-number-line"}, 
            !this.isValid() ? React.DOM.div(null, "invalid number line configuration") :
                React.DOM.div( {className:"graphie above-scratchpad", ref:"graphieDiv"} ),
            this.props.isInequality && inequalityControls
        );
    },

    handleReverse: function() {
        var newRel = reverseRel[this.props.rel];
        this.props.onChange({rel: newRel}, function()  {
            this.updateInequality(this.props.numLinePosition, 0);}.bind(this));
    },

    handleToggleStrict: function() {
        var newRel = toggleStrictRel[this.props.rel];
        this.props.onChange({rel: newRel});
        var isOpen = _(["lt", "gt"]).contains(newRel);
        var style = {
            stroke: KhanUtil.ORANGE,
            fill: isOpen ? KhanUtil._BACKGROUND : KhanUtil.ORANGE,
            "stroke-width": isOpen ? 3 : 1
        };
        this.point.modify({
            pointSize: 6,   // why does this not stay as it is?
            coord: [this.props.numLinePosition, 0],
            normalStyle: style,
            highlightStyle: style});
    },

    componentWillMount: function() {
        this.tickOrLabels = [];
    },

    componentDidMount: function() {
        this.initGraphie();
    },

    componentDidUpdate: function(prevProps) {
        // Will only update on editor change, not renderer change
        prevProps = _(prevProps).omit("rel", "numLinePosition");
        var newProps = _(this.props).omit("rel", "numLinePosition");
        if (this.isValid() && !deepEq(prevProps, newProps)) {
            var node = this.refs.graphieDiv.getDOMNode();
            // Use jQuery to remove so event handlers don't leak
            $(node).children().remove();

            var numLinePosition = this.props.initialX != null ?
                this.props.initialX :
                this.props.range[0];

            this.props.onChange({
                rel: "ge",
                numLinePosition: numLinePosition
            }, this.initGraphie);
        }
    },

    _label: function(pos, value) {
        value = value || pos;
        var labelStyle = this.props.labelStyle;

        // TODO(jack): Find out if any exercises have "decimal ticks" set,
        // and if so, re-save them and remove this check.
        if (labelStyle === "decimal" || labelStyle === "decimal ticks") {
            return this.graphie.label([pos, -0.53],
                Math.round(value * 100) / 100, "center");
        } else if (labelStyle === "improper") {
            var frac = KhanUtil.toFraction(value);
            return this.graphie.label([pos, -0.53],
                    formatImproper(frac[0], frac[1]), "center");
        } else if (labelStyle === "mixed") {
            var frac = KhanUtil.toFraction(value);
            return this.graphie.label([pos, -0.53],
                    formatMixed(frac[0], frac[1]), "center");
        }
    },

    updateInequality: function(px, py) {
        if (this.inequalityLine) {
            this.inequalityLine.remove();
            this.inequalityLine = null;
        }
        if (this.props.isInequality) {
            var isGreater = _(["ge","gt"]).contains(this.props.rel);
            var widthInPixels = 400;
            var range = this.props.range;
            var scale = (range[1] - range[0])/ widthInPixels;
            var buffer = 30 * scale;
            var left = range[0] - buffer, right = range[1] + buffer;
            var end = isGreater ? [right, py] : [left, py];
            var style = {
                arrows: "->",
                stroke: KhanUtil.BLUE,
                strokeWidth: 3.5
            };

            this.inequalityLine = this.graphie.line([px, py], end, style);
            this.inequalityLine.toFront();
            if(this.point) {
                this.point.toFront();
            }
        }
        return this.inequalityLine;
    },

    addNumberLinePoint: function(numLinePosition, tickStep) {
        var isOpen = _(["lt", "gt"]).contains(this.props.rel);
        var style = {
            stroke: KhanUtil.ORANGE,
            fill: isOpen ? KhanUtil._BACKGROUND : KhanUtil.ORANGE,
            "stroke-width": isOpen ? 3 : 1
        };

        if (this.point) {
            this.point.remove();
        }

        var left = this.props.range[0], right = this.props.range[1];
        this.point = Interactive2.addMovablePoint(this.graphie, {
            pointSize: 6,
            coord: [numLinePosition, 0],
            constraints: [
                function(coord, prevCoord)  {  // constrain-y
                    return [coord[0], prevCoord[1]];
                },
                function(coord, prevCoord)  {  // snap & bound
                    // In non-TickCtrl number lines, legal prevCoords should
                    // still be legal; in TickCtrl number lines, we don't want
                    // the point to jump after the ticks have changed
                    if (coord[0] === prevCoord[0]) {
                        return coord;
                    }
                    var x = coord[0];
                    var snapX = tickStep / this.props.snapDivisions;
                    x = bound(x, left, right);
                    x = left + Math.round((x - left) / (snapX)) * snapX;
                    return [x, coord[1]];
                }.bind(this)
            ],
            normalStyle: style,
            highlightStyle: style,
            onMove: function(coord)  {
                this.updateInequality(coord[0], coord[1]);
            }.bind(this),
            onMoveEnd: function(coord)  {
                if (coord[0] !== this.props.numLinePosition) {
                    this.props.onChange({numLinePosition: coord[0]});
                }
            }.bind(this)
        });
    },

    addTickControl: function(tickCtrlPosition, scale) {
        var width = this.props.range[1] - this.props.range[0];
        var tickCtrlWidth = (1/3) * width;
        var tickCtrlLeft = this.props.range[0] + (1/3) * width;
        var tickCtrlRight = this.props.range[0] + (2/3) * width;
        var textBuffer = 50 * scale;
        var textLeft = tickCtrlLeft - textBuffer;
        var textRight = tickCtrlRight + textBuffer;
        var divSpan= this.props.divisionRange[1] - this.props.divisionRange[0];

        this.graphie.line([tickCtrlLeft, 1.5], [tickCtrlRight, 1.5], {});
        this.graphie.label([textLeft, 1.5], "fewer ticks", "center", false);
        this.graphie.label([textRight, 1.5], "more ticks", "center", false);

        this.tickCtrl = Interactive2.addMovablePoint(this.graphie, {
            pointSize: 5,
            coord: [tickCtrlPosition, 1.5],
            constraints: [
                function(coord, prevCoord)  {  // constrain-y
                    return [coord[0], prevCoord[1]];
                },
                function(coord, prevCoord)  {  // snap & bound
                    var snapX = tickCtrlWidth / (divSpan);
                    x = bound(coord[0], tickCtrlLeft, tickCtrlRight);
                    x = tickCtrlLeft +
                        Math.round((x - tickCtrlLeft) / (snapX)) * snapX;
                    return [x, coord[1]];
                }
            ],
            onMove: function(coord)  {
                var opts = this.computeTickStep({tickCtrlPosition: coord[0]});
                this.drawTickMarks(opts.tickStep);
            }.bind(this),

            onMoveEnd: function(coord)  {
                var opts, tickCtrlPosition;
                if (coord[0] !== tickCtrlPosition) {
                    opts = this.computeTickStep({tickCtrlPosition: coord[0]});
                    this.addNumberLinePoint(this.props.numLinePosition,
                        opts.tickStep);
                    this.updateInequality(this.props.numLinePosition, 0);
                }
            }.bind(this)
        });
    },

    computeTickStep: function(options) {
        // Sets tickStep and draws the ticks/labels.

        var width = this.props.range[1] - this.props.range[0];
        var tickCtrlWidth = (1/3) * width;
        var tickCtrlLeft = this.props.range[0] + (1/3) * width;
        var tickCtrlRight = this.props.range[0] + (2/3) * width;
        var minDivs = this.props.divisionRange[0];
        var maxDivs = this.props.divisionRange[1];

        // If the user has changed the point, it's obviously the priority
        if (options.tickCtrlPosition) {
            tickCtrlPosition = bound(options.tickCtrlPosition,
                           tickCtrlLeft, tickCtrlRight);
            numDivs = minDivs + Math.round((maxDivs - minDivs) *
                    ((tickCtrlPosition - tickCtrlLeft) / tickCtrlWidth), 1);

        // Otherwise, if it still has the value provided by the editor
        } else if (options.numDivs || options.tickStep) {
            numDivs = options.numDivs || width / options.tickStep;
            tickCtrlPosition = tickCtrlLeft + tickCtrlWidth *
                        ((numDivs - minDivs) / (maxDivs - minDivs));

        // And if the editor failed to provide a value
        } else {
            tickCtrlPosition = tickCtrlLeft;
            numDivs = minDivs;
        }

        return {
            tickStep: width / numDivs,
            tickCtrlPosition: tickCtrlPosition
        };
    },

    renderLabels: function() {
        var labelRange = this.props.labelRange;
        var range = this.props.range;
        var leftLabel = labelRange[0] === "" ? range[0] : labelRange[0];
        var rightLabel = labelRange[1] === "" ? range[1] : labelRange[1];

        // Render the text labels
        this.graphie.style({color: KhanUtil.BLUE}, function()  {
            this.tickOrLabels.push(this._label(leftLabel));
            this.tickOrLabels.push(this._label(rightLabel));
        }.bind(this));

        // Render the labels' lines
        this.graphie.style({stroke: KhanUtil.BLUE, strokeWidth: 3.5}, function()  {
            this.graphie.line([leftLabel, -0.2], [leftLabel, 0.2]);
            this.graphie.line([rightLabel, -0.2], [rightLabel, 0.2]);
        }.bind(this));
    },

    drawTickMarks: function(tickStep) {
        // Avoid infinite loop
        if (!_.isFinite(tickStep) || tickStep <= 0) {
            return; // this has screwed me for the last time!
        }

        // Get rid of the previous ticks, if there are any
        _.each(this.tickOrLabels, function(tickOrLabel){
            tickOrLabel.remove();
        });

        // Draw and save the tick marks and tick labels
        var range = this.props.range;
        for (var x = range[0]; x <= range[1]; x += tickStep) {
            this.tickOrLabels.push(this.graphie.line([x, -0.2], [x, 0.2]));

            var labelTicks = this.props.labelTicks; // for lint :^(
            if (labelTicks || this.props.labelStyle === "decimal ticks") {
                this.tickOrLabels.push(this._label(x));
            }
        }

        if (this.inequalityLine) {
            this.inequalityLine.toFront();
        }

        this.renderLabels();

        // The point doesn't exist yet if the props recently changed
        // because the snapX of the point depends on the tickStep, but
        // if this is occuring as a result of the onMove of the tickCtrl
        // then the point remains stationary in what may become an invalid
        // place for it to snap (but it's great for comparisons!)
        if (this.point) {
            this.point.toFront();
        }
    },

    initGraphie: function() {
        var graphieDiv = this.refs.graphieDiv.getDOMNode();
        this.graphie = KhanUtil.createGraphie(graphieDiv);

        // Ensure a sane configuration to avoid infinite loops
        if (!this.isValid()) {return;}

        // Position variables
        var widthInPixels = 400;
        var range = this.props.range;
        var scale = (range[1] - range[0]) / widthInPixels;
        var buffer = 30 * scale;

        // Initiate the graphie without actually drawing anything
        var left = range[0] - buffer, right = range[1] + buffer;
        var bottom = -1, top = 1 + (this.props.isTickCtrl ? 1 : 0);
        this.graphie.init({
            range: [[left, right], [bottom, top]],
            scale: [1 / scale, 40]
        });
        this.graphie.addMouseLayer({
            allowScratchpad: true
        });

        // Draw the number line
        var center = (range[0] + range[1]) / 2;
        this.graphie.line([center, 0], [right, 0], {arrows: "->"});
        this.graphie.line([center, 0], [left, 0], {arrows: "->"});

        // Compute tickStep/tickCtrlPosition from props
        var opts = this.computeTickStep({
            numDivs: this.props.numDivisions,
            tickStep: this.props.tickStep
        });

        this.drawTickMarks(opts.tickStep);
        this.updateInequality(this.props.numLinePosition, 0);
        this.addNumberLinePoint(this.props.numLinePosition, opts.tickStep);

        if (this.props.isTickCtrl) {
            this.addTickControl(opts.tickCtrlPosition, scale);
        }
    },

    toJSON: function() {
        return {
            numLinePosition: this.props.numLinePosition,
            rel: this.props.isInequality ? this.props.rel : "eq"
        };
    },

    simpleValidate: function(rubric) {
        return NumberLine.validate(this.toJSON(), rubric);
    },

    focus: $.noop
});


_.extend(NumberLine, {
    validate: function(state, rubric) {
        var range = rubric.range;
        var start = rubric.initialX || 0;
        var startRel = rubric.isInequality ? "ge" : "eq";
        var correctRel = rubric.correctRel || "eq";

        if (eq(state.numLinePosition, rubric.correctX || 0) &&
                correctRel === state.rel) {
            return {
                type: "points",
                earned: 1,
                total: 1,
                message: null
            };
        } else if (state.numLinePosition === start && state.rel === startRel) {
            // We're where we started.
            return {
                type: "invalid",
                message: null
            };
        } else {
            return {
                type: "points",
                earned: 0,
                total: 1,
                message: null
            };
        }
    }
});


var NumberLineEditor = React.createClass({displayName: 'NumberLineEditor',
    getDefaultProps: function() {
        return {
            range: [0, 10],
            labelRange: ["", ""],
            divisionRange: [1, 10],
            labelStyle: "decimal",
            labelTicks: true,
            numDivisions: 5,
            tickStep: null,
            snapDivisions: 2,
            correctRel: "eq",
            correctX: null,
            initialX: null
        };
    },

    render: function() {
        var range = this.props.range;
        var labelRange = this.props.labelRange;
        var divisionRange = this.props.divisionRange;

        range[0] = +range[0]; range[1] = +range[1];

        var width = range[1] - range[0];
        var numDivisions = this.props.numDivisions;
        var snapDivisions = this.props.snapDivisions;
        var tickStep = this.props.tickStep;
        var isTickCtrl = this.props.isTickCtrl;

        if (!isTickCtrl) {
            // this will help constrain the answer to what is reachable
            step = tickStep ? tickStep / snapDivisions :
                  (width / numDivisions) / snapDivisions;
        } else {
            // but if tickCtrl is on, the range of what is reachable is
            // rather large, and it becomes obnoxious to check for this
            step = null;
        }

        var labelStyleEditorButtons = [
              {value: "decimal", text: "0.75", title: "Decimals",},
              {value: "improper", text: "\u2077\u2044\u2084",
                title: "Improper fractions"},
              {value: "mixed", text: "1\u00BE",
                title: "Mixed numbers"}];

        return React.DOM.div( {className:"perseus-widget-number-line-editor"}, 
            React.DOM.div( {className:"perseus-widget-row"}, 
                React.DOM.label(null, "correct x"),
                React.DOM.select( {value:this.props.correctRel,
                  onChange:this.onChangeRelation}, 
                    React.DOM.option( {value:"eq"},  " = " ),
                    React.DOM.option( {value:"lt"},  " < " ),
                    React.DOM.option( {value:"gt"},  " > " ),
                    React.DOM.option( {value:"le"},  " ≤ " ),
                    React.DOM.option( {value:"ge"},  " ≥ " )
                ),
                NumberInput( {value:this.props.correctX,
                    onChange:this.onNumChange.bind(this, "correctX"),
                    min:range[0], max:range[1], step:step,
                    placeholder:"answer", size:"normal"} ),
                InfoTip(null, React.DOM.p(null, 
                    "This is the correct answer. The answer is validated"+' '+
                    "(as right or wrong) by using only the end position of the"+' '+
                    "point and the relation (=, <, >, ≤, ≥)"
                ))
            ),

            React.DOM.div( {className:"perseus-widget-row"}, 
                NumberInput( {label:"position",
                    value:this.props.initialX,
                    onChange:this.onNumChange.bind(this, "initialX"),
                    placeholder:range[0],
                    min:range[0], max:range[1]} ),
                React.DOM.span(null,  " ∈ ", ' ', " " ),
                RangeInput( {value:range, onChange:this.onRangeChange} ),
                InfoTip(null, React.DOM.p(null, 
                    "This controls the initial position of the point along the"+' '+
                    "number line and the ", React.DOM.strong(null, "range"),", the position"+' '+
                    "of the endpoints of the number line. Setting the range"+' '+
                    "constrains the position of the answer and the labels."
                ))
            ),
            React.DOM.div( {className:"perseus-widget-row"}, 
                React.DOM.div( {className:"perseus-widget-left-col"}, 
                    React.DOM.span(null, "labels " ),
                    NumberInput(
                        {value:labelRange[0], placeholder:range[0],
                        min:range[0], max:range[1],
                        onChange:this.onLabelRangeChange.bind(this, 0)} ),
                    React.DOM.span(null,  " & " ),
                    NumberInput(
                        {value:labelRange[1], placeholder:range[1],
                        min:range[0], max:range[1],
                        onChange:this.onLabelRangeChange.bind(this, 1)} ),
                    InfoTip(null, React.DOM.p(null, 
                        "This controls the position of the left / right labels."+' '+
                        "By default, the labels are set by the range ", React.DOM.br(null ),
                        React.DOM.strong(null, "Note:"), " Ensure that the labels line up"+' '+
                        "with the tick marks, or it may be confusing for users."
                    ))
                ),
                React.DOM.div( {className:"perseus-widget-right-col"}, 
                    React.DOM.label(null, "style " ),
                    ButtonGroup( {allowEmpty:false,
                        value:this.props.labelStyle,
                        buttons:labelStyleEditorButtons,
                        onChange:this.onLabelStyleChange} ),
                    InfoTip(null, React.DOM.p(null, 
                        "This controls the styling of the labels for the two"+' '+
                        "main labels as well as all the tick mark labels,"+' '+
                        "if applicable. Your choices are decimal,"+' '+
                        "improper fractions, and mixed fractions."
                    ))
                )
            ),
            React.DOM.div( {className:"perseus-widget-row"}, 
                React.DOM.div( {className:"perseus-widget-left-col"}, 
                    PropCheckBox( {label:"show tick controller",
                        isTickCtrl:this.props.isTickCtrl,
                        onChange:this.props.onChange} )
                ),
                React.DOM.div( {className:"perseus-widget-right-col"}, 
                    PropCheckBox( {label:"show label ticks",
                        labelTicks:this.props.labelTicks,
                        onChange:this.props.onChange} )
                )
            ),
            React.DOM.div( {className:"perseus-widget-row"}, 
                NumberInput( {label:"num divisions",
                    value:this.props.numDivisions || "",
                    onChange:this.onNumDivisionsChange,
                    min:+divisionRange[0], max:+divisionRange[1],
                    placeholder:width / this.props.tickStep} ),
                isTickCtrl && React.DOM.span(null,  " ∈ ", ' ',
                    RangeInput( {value:divisionRange,
                        min:1, enforceInequality:true,
                        onChange:this.onDivisionRangeChange} ),
                    InfoTip(null, React.DOM.p(null, 
                    "This controls the number (and position) of the tick marks."+' '+
                    "The range dictates the minimum and maximum number of ticks"+' '+
                    "that the user can make using the tick controller. ", React.DOM.br(null ),
                    React.DOM.strong(null, "Note:"), " There is no check to see if labels"+' '+
                    "coordinate with the tick marks, which may be confusing for"+' '+
                    "users if the blue labels and black ticks are off-step."
                    ))),
                !isTickCtrl && React.DOM.span(null, 
                    NumberInput( {label: " or tick step",
                        value:this.props.tickStep || "",
                        onChange:this.onTickStepChange,
                        minExc:0, max:width,
                        placeholder:width / this.props.numDivisions} ),
                    InfoTip(null, React.DOM.p(null, 
                    "This controls the number (and position) of the tick marks;"+' '+
                    "you can either set the number of divisions (2 divisions"+' '+
                    "would split the entire range in two halves), or the"+' '+
                    "tick step (the distance between ticks) and the other"+' '+
                    "value will be updated accordingly. ", React.DOM.br(null ),
                    React.DOM.strong(null, "Note:"), " There is no check to see if labels"+' '+
                    "coordinate with the tick marks, which may be confusing for"+' '+
                    "users if the blue labels and black ticks are off-step."
                    )))
            ),
            React.DOM.div( {className:"perseus-widget-row"}, 
                NumberInput( {label:"snap increments per tick",
                    value:snapDivisions, minExc:0,
                    onChange:this.onNumChange.bind(this, "snapDivisions")} ),
                InfoTip(null, React.DOM.p(null, 
                    "This determines the number of different places the point"+' '+
                    "will snap between two adjacent tick marks. ", React.DOM.br(null ),
                    React.DOM.strong(null, "Note:"),"Ensure the required number of"+' '+
                    "snap increments is provided to answer the question."
                ))
            )

        );
    },

    onRangeChange: function(range) {
        // Changing the range constrains the initial position, as well as the
        // position of the answer and labels. Atm, it just marks them as
        // invalid and prevents the number line from showing; it was annoying
        // to change it for them, because if they're typing in fractions,
        // it registers one-at-a-time and messes things up.
        this.props.onChange({range: range});
    },

    onLabelRangeChange: function(i, num) {
        var range = this.props.range.slice(),
            labelRange = this.props.labelRange.slice(),
            otherNum = labelRange[1-i];

        if (num === "" || otherNum === "") {
            labelRange[i] = num;
        } else {
            // If both labels have values, this updates the "appropriate" one.
            // It enforces that the position of the left label <= right label.
            // If left otherwise, it makes certain aspects of validation hard.
            labelRange = [Math.min(num, otherNum), Math.max(num, otherNum)];
        }

        this.props.onChange({labelRange: labelRange});
    },

    onDivisionRangeChange: function(divisionRange) {
        var numDivisions = this.props.numDivisions;
        numDivisions = bound(numDivisions, divisionRange[0], divisionRange[1]);
        this.props.onChange({
            divisionRange: divisionRange,
            numDivisions: numDivisions});
    },

    onNumChange: function(key, value) {
        var opts = {};
        opts[key] = value;
        this.props.onChange(opts);
    },

    onNumDivisionsChange: function(numDivisions) {
        var divRange = this.props.divisionRange.slice();

        if (!_.isFinite(numDivisions)) {
            numDivisions = null;
        }

        // Auto-updates (constrains) the numDivisions to be within the range
        // of appliable divisions (more important for when the tick controller
        // isn't shown and otherwise shows as invalid for no apparent reason)
        divRange[0] = Math.max(1, Math.min(divRange[0], numDivisions));
        divRange[1] = Math.max(divRange[1], numDivisions);

        this.props.onChange({
            tickStep: null,
            divisionRange: divRange,
            numDivisions: numDivisions,
        });
    },

    onTickStepChange: function(tickStep) {
        this.props.onChange({
            numDivisions: null,
            tickStep: tickStep,
        });
    },

    onChangeRelation: function(e) {
        value = e.target.value;
        this.props.onChange({
            correctRel: value,
            isInequality: value !== "eq",
        });
    },

    onLabelStyleChange: function(labelStyle) {
        this.props.onChange({
            labelStyle: labelStyle
        });
    },

    toJSON: function() {
        return _(this.props).omit("onChange", "ref");
    }
});

Widgets.register("number-line", NumberLine);
Widgets.register("number-line-editor", NumberLineEditor);

},{"../components/button-group.jsx":5,"../components/info-tip.jsx":8,"../components/number-input.jsx":9,"../components/prop-check-box.jsx":10,"../components/range-input.jsx":11,"../core.js":15,"../interactive2.js":24,"../util.js":38,"../widgets.js":39}],50:[function(require,module,exports){
/** @jsx React.DOM */
(function(Perseus) {

require("../core.js");
var Util = require("../util.js");
require("../renderer.jsx");

var InfoTip        = require("../components/info-tip.jsx");
var TextListEditor = require("../components/text-list-editor.jsx");
var Widgets        = require("../widgets.js");

var PlaceholderCard = React.createClass({displayName: 'PlaceholderCard',
    propTypes: {
        width: React.PropTypes.number.isRequired,
        height: React.PropTypes.number.isRequired
    },

    render: function() {
        return React.DOM.div( {className:"card-wrap", style:{width: this.props.width}}, 
            React.DOM.div(
                {className:"card placeholder",
                style:{height: this.props.height}} )
        );
    }
});

var DragHintCard = React.createClass({displayName: 'DragHintCard',
    render: function() {
        return React.DOM.div( {className:"card-wrap"}, 
            React.DOM.div( {className:"card drag-hint"} )
        );
    }
});

var DraggableCard = React.createClass({displayName: 'DraggableCard',
    propTypes: {
        width: React.PropTypes.number,
        stack: React.PropTypes.bool,
        onMouseDown: React.PropTypes.func.isRequired
    },

    getDefaultProps: function() {
        return {
            stack: false
        };
    },

    render: function() {
        var style = {};
        if (this.props.width) {
            style.width = this.props.width;
        }

        var className = ["card"];
        if (this.props.stack) {
            className.push("stack");
        }

        // Pull out the content to get rendered
        var rendererProps = _.pick(this.props, "content");

        return React.DOM.div( {className:"card-wrap",
                    style:style}, 
                React.DOM.div( {className:className.join(" "),
                       onMouseDown:this.onMouseDown,
                       onTouchStart:this.onMouseDown}, 
                    Perseus.Renderer(rendererProps)
                )
            );
    },

    onMouseDown: function(event) {
        if (!(event.button === 0 ||
                (event.touches != null && event.touches.length === 1))) {
            return;
        }

        event.preventDefault();
        if (event.touches != null) {
            this.props.onMouseDown(this, {
                    pageX: event.touches[0].pageX,
                    pageY: event.touches[0].pageY
                });
        } else {
            this.props.onMouseDown(this, event);
        }
    }

});

var PropTypes = {
    position: React.PropTypes.shape({
        left: React.PropTypes.number,
        top: React.PropTypes.number
    })
};

var FloatingCard = React.createClass({displayName: 'FloatingCard',
    propTypes: {
        startMouse: PropTypes.position,
        startOffset: PropTypes.position.isRequired,
        width: React.PropTypes.number.isRequired,
        animating: React.PropTypes.bool,
        animateTo: PropTypes.position,
        onAnimationEnd: React.PropTypes.func,
        floating: React.PropTypes.bool.isRequired,
        onMouseMove: React.PropTypes.func,
        onMouseUp: React.PropTypes.func
    },

    getDefaultProps: function() {
        return {
            animating: false
        };
    },

    getInitialState: function() {
        return {
            mouse: this.props.startMouse
        };
    },

    render: function() {
        var style = {
            position: "absolute",
            left: this.props.startOffset.left,
            top: this.props.startOffset.top,
            width: this.props.width
        };

        var className = ["card"];
        if (!this.props.animating) {
            className.push("dragging");
            style.left += this.state.mouse.left - this.props.startMouse.left;
            style.top += this.state.mouse.top - this.props.startMouse.top;
        }

        // Pull out the content to get rendered
        var rendererProps = _.pick(this.props, "content");

        return React.DOM.div( {className:"card-wrap",
                    style:style}, 
                React.DOM.div( {className:className.join(" ")}, 
                    Perseus.Renderer(rendererProps)
                )
            );
    },

    componentDidMount: function() {
        $(document).on("vmousemove", this.onVMouseMove);
        $(document).on("vmouseup", this.onVMouseUp);
    },

    componentWillUnmount: function() {
        $(document).off("vmousemove", this.onVMouseMove);
        $(document).off("vmouseup", this.onVMouseUp);
    },

    componentDidUpdate: function(prevProps, prevState) {
        if (this.props.animating && !prevProps.animating) {
            // If we just were changed into animating, start the animation.
            // We pick the animation speed based on the distance that the card
            // needs to travel. (Why sqrt? Just because it looks nice -- with a
            // linear scale, far things take too long to come back.)
            var ms = 15 * Math.sqrt(
                Math.sqrt(
                    Math.pow(this.props.animateTo.left -
                             this.props.startOffset.left, 2) +
                    Math.pow(this.props.animateTo.top -
                             this.props.startOffset.top, 2)
                )
            );
            $(this.getDOMNode()).animate(
                this.props.animateTo, Math.max(ms, 1),
                this.props.onAnimationEnd
            );
        }
    },

    onVMouseMove: function(event) {
        if (this.props.floating) {
            event.preventDefault();
            this.setState({
                mouse: {left: event.pageX, top: event.pageY}
            });
            this.props.onMouseMove(this);
        }
    },

    onVMouseUp: function(event) {
        if (this.props.floating) {
            event.preventDefault();
            this.props.onMouseUp(this, event);
        }
    }
});

var NORMAL = "normal",
    AUTO = "auto",
    HORIZONTAL = "horizontal",
    VERTICAL = "vertical";

var Orderer = React.createClass({displayName: 'Orderer',
    propTypes: {
        current: React.PropTypes.array,
        options: React.PropTypes.array,
        correctOptions: React.PropTypes.array,
        height: React.PropTypes.oneOf([NORMAL, AUTO]),
        layout: React.PropTypes.oneOf([HORIZONTAL, VERTICAL])
    },

    getDefaultProps: function() {
        return {
            current: [],
            options: [],
            correctOptions: [],
            height: NORMAL,
            layout: HORIZONTAL
        };
    },

    getInitialState: function() {
        return {
            current: [],
            dragging: false,
            placeholderIndex: null
        };
    },

    render: function() {
        var orderer = this;

        // This is the card we are currently dragging
        var dragging = this.state.dragging &&
            FloatingCard( {floating:true,
                       content:this.state.dragContent,
                       startOffset:this.state.offsetPos,
                       startMouse:this.state.grabPos,
                       width:this.state.dragWidth,
                       onMouseUp:this.onRelease,
                       onMouseMove:this.onMouseMove,
                       key:"draggingCard"}
                       );

        // This is the card that is currently animating
        var animating = this.state.animating &&
            FloatingCard( {floating:false,
                       animating:true,
                       content:this.state.dragContent,
                       startOffset:this.state.offsetPos,
                       width:this.state.dragWidth,
                       animateTo:this.state.animateTo,
                       onAnimationEnd:this.state.onAnimationEnd,
                       key:"draggingCard"}
                       );

        // This is the list of draggable, rearrangable cards
        var sortableCards = _.map(this.state.current, function(opt, i) {
            return DraggableCard(
                {ref:"sortable" + i,
                content:opt.content,
                width:opt.width,
                key:opt.key,
                onMouseDown:orderer.onClick.bind(orderer, "current", i)} );
        });

        if (this.state.placeholderIndex != null) {
            var placeholder = PlaceholderCard(
                {ref:"placeholder",
                width:this.state.dragWidth,
                height:this.state.dragHeight,
                key:"placeholder"} );
            sortableCards.splice(this.state.placeholderIndex, 0, placeholder);
        }

        // If there are no cards in the list, then add a "hint" card
        var sortable = React.DOM.div( {className:"ui-helper-clearfix draggable-box"}, 
            !sortableCards.length && DragHintCard(null ),
            React.DOM.div( {ref:"dragList"}, sortableCards)
        );

        // This is the bank of stacks of cards
        var bank = React.DOM.div( {ref:"bank", className:"bank ui-helper-clearfix"}, 
            _.map(this.props.options, function(opt, i) {
                return DraggableCard(
                    {ref:"bank" + i,
                    content:opt.content,
                    stack:true,
                    key:i,
                    onMouseDown:orderer.onClick.bind(orderer, "bank", i)} );
            })
        );

        return React.DOM.div( {className:"draggy-boxy-thing orderer " +
                        "height-" + this.props.height + " " +
                        "layout-" + this.props.layout + " " +
                        "above-scratchpad blank-background " +
                        "ui-helper-clearfix",
                    ref:"orderer"}, 
                   bank,
                   sortable,
                   dragging,
                   animating
               );
    },

    onClick: function(type, index, draggable,  event) {
        var $draggable = $(draggable.getDOMNode());
        var list = this.state.current.slice();

        var opt;
        var placeholderIndex = null;

        if (type === "current") {
            // If this is coming from the original list, remove the original
            // card from the list
            list.splice(index, 1);
            opt = this.state.current[index];
            placeholderIndex = index;
        } else if (type === "bank") {
            opt = this.props.options[index];
        }

        this.setState({
            current: list,
            dragging: true,
            placeholderIndex: placeholderIndex,
            dragContent: opt.content,
            dragWidth: $draggable.width(),
            dragHeight: $draggable.height(),
            grabPos: {
                left: event.pageX,
                top: event.pageY
            },
            offsetPos: $draggable.position()
        });
    },

    onRelease: function(draggable, event) {
        var inCardBank = this.isCardInBank(draggable);
        var index = this.state.placeholderIndex;

        // Here, we build a callback function for the card to call when it is
        // done animating
        var onAnimationEnd = function() {
            var list = this.state.current.slice();

            if (!inCardBank) {
                // Insert the new card into the position
                var newCard = {
                    content: this.state.dragContent,
                    key: _.uniqueId("perseus_draggable_card_"),
                    width: this.state.dragWidth
                };

                list.splice(index, 0, newCard);
            }

            this.props.onChange({
                current: list
            });
            this.setState({
                current: list,
                dragging: false,
                placeholderIndex: null,
                animating: false
            });
        }.bind(this);

        // Find the position of the card we should animate to
        var offset = $(draggable.getDOMNode()).position();
        var finalOffset = null;
        if (inCardBank) {
            // If we're in the card bank, go through the options to find the
            // one with the same content
            _.each(this.props.options, function(opt, i) {
                if (opt.content === this.state.dragContent) {
                    var card = this.refs["bank" + i].getDOMNode();
                    finalOffset = $(card).position();
                }
            }, this);
        } else {
            // Otherwise, go to the position that the placeholder is at
            finalOffset = $(this.refs.placeholder.getDOMNode()).position();
        }

        if (finalOffset == null) {
            // If we didn't find a card to go to, simply make the changes we
            // would have made at the end. (should only happen if we are
            // messing around with card contents, and not on the real site)
            onAnimationEnd();
        } else {
            this.setState({
                offsetPos: offset,
                animateTo: finalOffset,
                onAnimationEnd: onAnimationEnd,
                animating: true,
                dragging: false
            });
        }
    },

    onMouseMove: function(draggable) {
        var index;
        if (this.isCardInBank(draggable)) {
            index = null;
        } else {
            index = this.findCorrectIndex(draggable, this.state.current);
        }

        this.setState({placeholderIndex: index});
    },

    findCorrectIndex: function(draggable, list) {
        // Find the correct index for a card given the current cards.
        var isHorizontal = this.props.layout === HORIZONTAL,
            $dragList = $(this.refs.dragList.getDOMNode()),
            leftEdge = $dragList.offset().left,
            topEdge = $dragList.offset().top,
            midWidth = $(draggable.getDOMNode()).offset().left - leftEdge,
            midHeight = $(draggable.getDOMNode()).offset().top - topEdge,
            index = 0,
            sumWidth = 0,
            sumHeight = 0;

        if (isHorizontal) {
            _.each(list, function(opt, i) {
                var card = this.refs["sortable" + i].getDOMNode();
                var outerWidth = $(card).outerWidth(true);
                if (midWidth > sumWidth + outerWidth / 2) {
                    index += 1;
                }
                sumWidth += outerWidth;
            }, this);
        } else {
            _.each(list, function(opt, i) {
                var card = this.refs["sortable" + i].getDOMNode();
                var outerHeight = $(card).outerHeight(true);
                if (midHeight > sumHeight + outerHeight / 2) {
                    index += 1;
                }
                sumHeight += outerHeight;
            }, this);
        }

        return index;
    },

    isCardInBank: function(draggable) {
        var isHorizontal = this.props.layout === HORIZONTAL,
            $draggable = $(draggable.getDOMNode()),
            $bank = $(this.refs.bank.getDOMNode()),
            draggableOffset = $draggable.offset(),
            bankOffset = $bank.offset(),
            draggableHeight = $draggable.outerHeight(true),
            bankHeight = $bank.outerHeight(true),
            bankWidth = $bank.outerWidth(true),
            dragList = this.refs.dragList.getDOMNode(),
            dragListWidth = $(dragList).width(),
            draggableWidth = $draggable.outerWidth(true),
            currentWidth =
                _.reduce(this.state.current, function(sum, opt, i) {
                    var card = this.refs["sortable" + i].getDOMNode();
                    return sum + $(card).outerWidth(true);
                }, 0, this);

        if (isHorizontal) {
            return (draggableOffset.top + draggableHeight / 2 <
                    bankOffset.top + bankHeight) ||
                   (currentWidth + draggableWidth > dragListWidth);
        } else {
            return (draggableOffset.left + draggableWidth / 2 <
                    bankOffset.left + bankWidth);
        }
    },

    toJSON: function(skipValidation) {
        return {current: _.map(this.props.current, function(v) {
            return v.content;
        })};
    },

    simpleValidate: function(rubric) {
        return Orderer.validate(this.toJSON(), rubric);
    },
});

_.extend(Orderer, {
    validate: function(state, rubric) {
        if (state.current.length === 0) {
            return {
                type: "invalid",
                message: null
            };
        }

        var correct = _.isEqual(
            state.current,
            _.pluck(rubric.correctOptions, 'content')
        );

        return {
            type: "points",
            earned: correct ? 1 : 0,
            total: 1,
            message: null
        };
    }
});


var OrdererEditor = React.createClass({displayName: 'OrdererEditor',
    propTypes: {
        correctOptions: React.PropTypes.array,
        otherOptions: React.PropTypes.array,
        height: React.PropTypes.oneOf([NORMAL, AUTO]),
        layout: React.PropTypes.oneOf([HORIZONTAL, VERTICAL]),
        onChange: React.PropTypes.func.isRequired
    },

    getDefaultProps: function() {
        return {
            correctOptions: [
                {content: "$x$"}
            ],
            otherOptions: [
                {content: "$y$"}
            ],
            height: NORMAL,
            layout: HORIZONTAL
        };
    },

    render: function() {
        var editor = this;

        return React.DOM.div( {className:"perseus-widget-orderer"}, 
            React.DOM.div(null, 
                ' ',"Correct answer:",' ',
                InfoTip(null, React.DOM.p(null, 
                    "Place the cards in the correct order. The same card can be"+' '+
                    "used more than once in the answer but will only be"+' '+ 
                    "displayed once at the top of a stack of identical cards."
                ))
            ),
            TextListEditor(
                {options:_.pluck(this.props.correctOptions, "content"),
                onChange:this.onOptionsChange.bind(this, "correctOptions"),
                layout:this.props.layout} ),

            React.DOM.div(null, 
                ' ',"Other cards:",' ',
                InfoTip(null, 
                    React.DOM.p(null, "Create cards that are not part of the answer.")
                )
            ),
            TextListEditor(
                {options:_.pluck(this.props.otherOptions, "content"),
                onChange:this.onOptionsChange.bind(this, "otherOptions"),
                layout:this.props.layout} ),

            React.DOM.div(null, 
                React.DOM.label(null, 
                    ' ',"Layout:",' ',
                    React.DOM.select( {value:this.props.layout,
                            onChange:this.onLayoutChange}, 
                        React.DOM.option( {value:HORIZONTAL}, "Horizontal"),
                        React.DOM.option( {value:VERTICAL}, "Vertical")
                    )
                ),
                InfoTip(null, 
                    React.DOM.p(null, "Use the horizontal layout for short text and small"+' '+
                    "images. The vertical layout is best for longer text (e.g."+' '+
                    "proofs).")
                )
            ),
            React.DOM.div(null, 
                React.DOM.label(null, 
                    ' ',"Height:",' ',
                    React.DOM.select( {value:this.props.height,
                            onChange:this.onHeightChange}, 
                        React.DOM.option( {value:NORMAL}, "Normal"),
                        React.DOM.option( {value:AUTO}, "Automatic")
                    )
                ),
                InfoTip(null, 
                    React.DOM.p(null, "Use \"Normal\" for text, \"Automatic\" for images.")
                )
            )
        );
    },

    onOptionsChange: function(whichOptions, options, cb) {
        var props = {};
        props[whichOptions] = _.map(options, function(option) {
            return {content: option};
        });
        this.props.onChange(props, cb);
    },

    onLayoutChange: function(e) {
        this.props.onChange({layout: e.target.value});
    },

    onHeightChange: function(e) {
        this.props.onChange({height: e.target.value});
    },

    toJSON: function(skipValidation) {
        // We combine the correct answer and the other cards by merging them,
        // removing duplicates and empty cards, and sorting them into
        // categories based on their content
        var options =
            _.chain(_.pluck(this.props.correctOptions, 'content'))
             .union(_.pluck(this.props.otherOptions, 'content'))
             .uniq()
             .reject(function(content) { return content === ""; })
             .sort()
             .sortBy(function(content) {
                 if (/\d/.test(content)) {
                     return 0;
                 } else if (/^\$?[a-zA-Z]+\$?$/.test(content)) {
                     return 2;
                 } else {
                     return 1;
                 }
             })
             .map(function(content) {
                 return { content: content };
             })
             .value();

        return {
            options: options,
            correctOptions: this.props.correctOptions,
            otherOptions: this.props.otherOptions,
            height: this.props.height,
            layout: this.props.layout
        };
    }
});

Widgets.register("orderer", Orderer);
Widgets.register("orderer-editor", OrdererEditor);

})(Perseus);


},{"../components/info-tip.jsx":8,"../components/text-list-editor.jsx":13,"../core.js":15,"../renderer.jsx":36,"../util.js":38,"../widgets.js":39}],51:[function(require,module,exports){
/** @jsx React.DOM */
(function(Perseus) {

require("../core.js");
var Util = require("../util.js");

var NumberInput = require("../components/number-input.jsx");
var InfoTip = require("../components/info-tip.jsx");
var TextListEditor = require("../components/text-list-editor.jsx");
var Widgets = require("../widgets.js");

var deepEq = Util.deepEq;

var BAR = "bar",
    LINE = "line",
    PIC = "pic",
    HISTOGRAM = "histogram",
    DOTPLOT = "dotplot";

var DOT_PLOT_POINT_SIZE = 4;
var DOT_PLOT_POINT_PADDING = 8;

var widgetPropTypes = {
    type: React.PropTypes.oneOf([BAR, LINE, PIC, HISTOGRAM, DOTPLOT]),
    labels: React.PropTypes.arrayOf(React.PropTypes.string),
    categories: React.PropTypes.arrayOf(React.PropTypes.oneOfType([
        React.PropTypes.number,
        React.PropTypes.string
    ])),

    scaleY: React.PropTypes.number,
    maxY: React.PropTypes.number,
    snapsPerLine: React.PropTypes.number,

    picSize: React.PropTypes.number,
    pixBoxHeight: React.PropTypes.number,
    picUrl: React.PropTypes.string,

    plotDimensions: React.PropTypes.arrayOf(React.PropTypes.number),
    labelInterval: React.PropTypes.number
};

var formatNumber = function(num)  {return "$" + KhanUtil.knumber.round(num, 2) + "$";};

var Plotter = React.createClass({displayName: 'Plotter',
    propTypes: widgetPropTypes,

    getDefaultProps: function () {
        return {
            type: BAR,
            labels: ["", ""],
            categories: [""],

            scaleY: 1,
            maxY: 10,
            snapsPerLine: 2,

            picSize: 40,
            picBoxHeight: 48,
            picUrl: "",

            plotDimensions: [380, 300],
            labelInterval: 1
        };
    },

    getInitialState: function() {
        return {
            values: this.props.starting || [1]
        };
    },

    render: function() {
        return React.DOM.div(
            {className:"perseus-widget-plotter graphie above-scratchpad",
            ref:"graphieDiv"} );
    },

    componentDidUpdate: function(prevProps, prevState) {
        if (this.shouldSetupGraphie) {
            this.setupGraphie(prevState);
        }
    },

    componentDidMount: function() {
        this.setupGraphie(this.state);
    },

    componentWillReceiveProps: function(nextProps) {
        var props = ["type", "labels", "categories", "scaleY", "maxY",
            "snapsPerLine", "picUrl", "labelInterval"];

        this.shouldSetupGraphie = _.any(props, function (prop) {
            return !_.isEqual(this.props[prop], nextProps[prop]);
        }, this);

        if (!_.isEqual(this.props.starting, nextProps.starting) &&
            !_.isEqual(this.state.values, nextProps.starting)) {
            this.shouldSetupGraphie = true;
            this.setState({values: nextProps.starting});
        }
    },

    setupGraphie: function(prevState) {
        var self = this;
        self.shouldSetupGraphie = false;
        var graphieDiv = self.refs.graphieDiv.getDOMNode();
        $(graphieDiv).empty();
        var graphie = KhanUtil.createGraphie(graphieDiv);

        // TODO(jakesandlund): It's not the react way to hang
        // something off the component object, but since graphie
        // is outside React, it makes it easier to do this.
        self.graphie = graphie;
        self.graphie.pics = [];
        self.mousedownPic = false;

        var isBar = self.props.type === BAR,
            isLine = self.props.type === LINE,
            isPic = self.props.type === PIC,
            isHistogram = self.props.type === HISTOGRAM,
            isDotplot = self.props.type === DOTPLOT;

        var isTiledPlot = isPic || isDotplot;

        var config = {};
        var c = config; // c for short

        c.graph = {
            lines: [],
            bars: [],
            points: [],
            dividers: []
        };
        c.scaleY = self.props.scaleY;
        c.dimX = self.props.categories.length;
        var plotDimensions = self.props.plotDimensions;
        if (isLine) {
            c.dimX += 1;
        } else if (isHistogram) {
            c.barPad = 0;
            c.barWidth = 1;
        } else if (isBar) {
            c.barPad = 0.15;
            c.barWidth = 1 - 2 * c.barPad;
            c.dimX += 2 * c.barPad;
        } else if (isTiledPlot) {
            c.picBoxHeight = self.props.picBoxHeight;
            c.picBoxWidthPx = plotDimensions[0] / self.props.categories.length;
            var picPadAllWidth = plotDimensions[0] - c.dimX * c.picBoxWidthPx;
            c.picPad = picPadAllWidth / (2 * c.dimX + 2);
            var picFullWidth = c.picBoxWidthPx + 2 * c.picPad;

            // Convert from px to "unscaled"
            c.picPad = c.picPad / picFullWidth;
            c.picBoxWidth = c.picBoxWidthPx / picFullWidth;
            c.dimX += 2 * c.picPad;
        }

        if (isDotplot) {
            c.picBoxHeight = DOT_PLOT_POINT_SIZE * 2 + DOT_PLOT_POINT_PADDING;
        }

        c.dimY = Math.ceil(self.props.maxY / c.scaleY) * c.scaleY;
        c.scale = _.map([c.dimX, c.dimY], function (dim, i) {
            return plotDimensions[i] / dim;
        });
        if (isTiledPlot) {
            c.scale[1] = c.picBoxHeight / c.scaleY;
        }

        var padX = 25 / c.scale[0];
        var padY = 25 / c.scale[1];

        // Since dotplot doesn't have an axis along the left it looks weird
        // with the same padding as the others
        if (isDotplot) {
            padX /= 2;
        }

        graphie.init({
            range: [[-3 * padX, c.dimX + padX], [-3 * padY, c.dimY + padY]],
            scale: c.scale
        });
        graphie.addMouseLayer({
            allowScratchpad: true
        });

        if (!isTiledPlot) {
            for (var y = 0; y <= c.dimY; y += c.scaleY) {
                graphie.label(
                    [0, y],
                    KhanUtil.roundToApprox(y, 2),
                    "left",
                    /* isTeX */ true /* for the \approx symbol */
                );
                graphie.style(
                    {stroke: "#000", strokeWidth: 1, opacity: 0.3},
                    function() {
                        graphie.line([0, y], [c.dimX, y]);
                    });
            }
        }

        self.setupCategories(config);

        if (isTiledPlot) {
            self.mousedownPic = false;
            $(document).on("mouseup.plotterPic", function() {
                self.mousedownPic = false;
            });
            self.drawPicHeights(self.state.values, prevState.values);
        }

        graphie.style(
            {stroke: "#000", strokeWidth: 2, opacity: 1.0},
            function() {
                if (isDotplot) {
                    graphie.line([0.5, 0], [c.dimX - 0.5, 0]);
                } else {
                    graphie.line([0, 0], [c.dimX, 0]);
                    graphie.line([0, 0], [0, c.dimY]);
                }
            });

        graphie.label([c.dimX / 2, -35 / c.scale[1]],
            self.props.labels[0],
            "below", false)
            .css("font-weight", "bold");

        graphie.label([-60 / c.scale[0], c.dimY / 2],
            self.props.labels[1],
            "center", false)
            .css("font-weight", "bold")
            .addClass("rotate");
    },

	labelCategory: function(x, category) {
		var graphie = this.graphie;
		category = category + "";
		var isTeX = false;
		var mathyCategory = category.match(/^\$(.*)\$$/);
		if (mathyCategory) {
			category = mathyCategory[1];
			isTeX = true;
		}
		graphie.label([x, 0], category, "below", isTeX);
	},

    setupCategories: function(config) {
        var self = this;
        var c = config;
        var graphie = self.graphie;

        if (self.props.type === HISTOGRAM) {
            // Histograms with n labels/categories have n - 1 buckets
            var scale = _.times(self.props.categories.length - 1, function(i) {
                return self.setupHistogram(i, self.state.values[i], config);
            });

            // Scale buckets (bars) and dividers
            _.invoke(scale, "call");

            // Label categories
            _.each(self.props.categories, function(category, i) {
                var x = 0.5 + i * c.barWidth;

                self.labelCategory(x, category);
                var tickHeight = 6 / c.scale[1];
                graphie.style({
                    stroke: "#000", strokeWidth: 2, opacity: 1.0
                }, function() {
                    graphie.line([x, -tickHeight], [x, 0]);
                });
            });
        } else {
            _.each(self.props.categories, function (category, i) {
                var startHeight = self.state.values[i];
                var x;

                if (self.props.type === BAR) {
                    x = self.setupBar(i, startHeight, config);
                } else if (self.props.type === LINE) {
                    x = self.setupLine(i, startHeight, config);
                } else if (self.props.type === PIC) {
                    x = self.setupPic(i, config);
                } else if (self.props.type === DOTPLOT) {
                    x = self.setupDotplot(i, config);
                }

                var tickStart = 0;
                var tickEnd = -6 / c.scale[1];

                if (self.props.type === DOTPLOT) {
                    tickStart = -tickEnd;
                }

                if (self.props.type === DOTPLOT) {
                    // Dotplot lets you specify to only show labels every 'n'
                    // ticks. It also looks nicer if it makes the labelled
                    // ticks a bit bigger.
                    if (i % self.props.labelInterval === 0 ||
                            i === self.props.categories.length - 1) {
                        self.labelCategory(x, category);
                        tickStart *= 1.5;
                        tickEnd *= 1.5;
                    }
                } else {
                    self.labelCategory(x, category);
                }

                graphie.style({
                    stroke: "#000", strokeWidth: 2, opacity: 1.0
                }, function() {
                    graphie.line([x, tickStart], [x, tickEnd]);
                });
            });
        }
    },

    setupHistogram: function(i, startHeight, config) {
        var self = this;
        var c = config;
        var graphie = self.graphie;
        var barHalfWidth = c.barWidth / 2;
        var x = 0.5 + i * c.barWidth + barHalfWidth;

        var scaleBar = function(i, height) {
            var center = graphie.scalePoint(0);

            // Scale filled bucket (bar)
            c.graph.bars[i].scale(
                1, Math.max(0.01, height / c.scaleY),
                center[0], center[1]
            );

            // Scale dividers between buckets
            var leftDivider = c.graph.dividers[i - 1],
                rightDivider = c.graph.dividers[i];

            if (leftDivider) {
                var divHeight = Math.min(self.state.values[i - 1], height);
                leftDivider.scale(
                    1, Math.max(0.01, divHeight / c.scaleY),
                    center[0], center[1]
                );
            }

            if (rightDivider) {
                var divHeight = Math.min(height, self.state.values[i + 1]);
                rightDivider.scale(
                    1, Math.max(0.01, divHeight / c.scaleY),
                    center[0], center[1]
                );
            }

            // Align top of bar to edge unless at bottom
            if (height) {
                c.graph.lines[i].visibleLine.translate(0, 2);
            }
        };

        graphie.style({
            stroke: "none", fill: "#9ab8ed", opacity: 1.0
        }, function() {
            c.graph.bars[i] = graphie.path([
                [x - barHalfWidth, 0],
                [x - barHalfWidth, c.scaleY],
                [x + barHalfWidth, c.scaleY],
                [x + barHalfWidth, 0],
                [x - barHalfWidth, 0]
            ]);
        });

        if (i) {
            // Don't draw a divider to the left of the first bucket
            graphie.style({
                stroke: "#000", strokeWidth: 1, opacity: 0.3
            }, function() {
                c.graph.dividers.push(graphie.path([
                    [x - barHalfWidth, 0],
                    [x - barHalfWidth, c.scaleY]
                ]));
            });
        }

        c.graph.lines[i] = graphie.addMovableLineSegment({
            coordA: [x - barHalfWidth, startHeight],
            coordZ: [x + barHalfWidth, startHeight],
            snapY: c.scaleY / self.props.snapsPerLine,
            constraints: {
                constrainX: true
            },
            normalStyle: {
                "stroke": KhanUtil.BLUE,
                "stroke-width": 4
            }
        });

        c.graph.lines[i].onMove = function(dx, dy) {
            var y = this.coordA[1];
            if (y < 0 || y > c.dimY) {
                y = Math.min(Math.max(y, 0), c.dimY);
                this.coordA[1] = this.coordZ[1] = y;

                // Snap the line back into range.
                this.transform();
            }

            var values = _.clone(self.state.values);
            values[i] = y;
            self.setState({values: values});
            self.props.onChange({ values: values });

            scaleBar(i, y);
        };

        return _.bind(scaleBar, this, i, startHeight);
    },

    setupBar: function(i, startHeight, config) {
        var self = this;
        var c = config;
        var graphie = self.graphie;
        var x = i + 0.5 + c.barPad;
        var barHalfWidth = c.barWidth / 2;

        var scaleBar = function(i, height) {
            var center = graphie.scalePoint(0);
            c.graph.bars[i].scale(
                    1, Math.max(0.01, height / c.scaleY),
                    center[0], center[1]);

            // Align top of bar to edge unless at bottom
            if (height) {
                c.graph.lines[i].visibleLine.translate(0, 2);
            }
        };

        graphie.style(
            {stroke: "none", fill: "#9ab8ed", opacity: 1.0},
            function() {
                c.graph.bars[i] = graphie.path([
                    [x - barHalfWidth, 0],
                    [x - barHalfWidth, c.scaleY],
                    [x + barHalfWidth, c.scaleY],
                    [x + barHalfWidth, 0],
                    [x - barHalfWidth, 0]
                ]);
            });

        c.graph.lines[i] = graphie.addMovableLineSegment({
            coordA: [x - barHalfWidth, startHeight],
            coordZ: [x + barHalfWidth, startHeight],
            snapY: c.scaleY / self.props.snapsPerLine,
            constraints: {
                constrainX: true
            },
            normalStyle: {
                "stroke": KhanUtil.BLUE,
                "stroke-width": 4
            }
        });

        c.graph.lines[i].onMove = function(dx, dy) {
            var y = this.coordA[1];
            if (y < 0 || y > c.dimY) {
                y = Math.min(Math.max(y, 0), c.dimY);
                this.coordA[1] = this.coordZ[1] = y;

                // Snap the line back into range.
                this.transform();
            }

            var values = _.clone(self.state.values);
            values[i] = y;
            self.setState({values: values});
            self.props.onChange({ values: values });

            scaleBar(i, y);
        };

        scaleBar(i, startHeight);
        return x;
    },

    setupLine: function(i, startHeight, config) {
        var self = this;
        var c = config;
        var graphie = self.graphie;
        var x = i + 1;
        c.graph.points[i] = graphie.addMovablePoint({
            coord: [x, startHeight],
            constraints: {
                constrainX: true
            },
            normalStyle: {
                fill: KhanUtil.BLUE,
                stroke: KhanUtil.BLUE
            },
            snapY: c.scaleY / self.props.snapsPerLine,
        });
        c.graph.points[i].onMove = function(x, y) {
            y = Math.min(Math.max(y, 0), c.dimY);
            var values = _.clone(self.state.values);
            values[i] = y;
            self.setState({values: values});
            self.props.onChange({ values: values });
            return [x, y];
        };
        if (i > 0) {
            c.graph.lines[i] = graphie.addMovableLineSegment({
                pointA: c.graph.points[i - 1],
                pointZ: c.graph.points[i],
                constraints: {
                    fixed: true
                },
                normalStyle: {
                    stroke: "#9ab8ed",
                    "stroke-width": 2
                }
            });
        }
        return x;
    },

    setupDotplot: function(i, config) {
        var graphie = this.graphie;
        return this.setupTiledPlot(i, 1, config, function(x, y)  {
            return graphie.ellipse([x, y],
                 [
                     DOT_PLOT_POINT_SIZE / graphie.scale[0],
                     DOT_PLOT_POINT_SIZE / graphie.scale[1]
                 ],
                 {
                    fill: KhanUtil.BLUE,
                    stroke: KhanUtil.BLUE
                 });
        });
    },

    setupPic: function(i, config) {
        var graphie = this.graphie;
        return this.setupTiledPlot(i, 0, config, function(x, y)  {
            var scaledCenter = graphie.scalePoint([x, y]);
            var size = this.props.picSize;
            return graphie.raphael.image(
                    this.props.picUrl,
                    scaledCenter[0] - size / 2,
                    scaledCenter[1] - size / 2,
                    size,
                    size);
        }.bind(this));
    },

    setupTiledPlot: function(i, bottomMargin, config, createImage) {
        var self = this;
        var c = config;
        var graphie = self.graphie;
        var pics = graphie.pics;
        var x = i + 0.5 + c.picPad;

        pics[i] = [];
        var n = Math.round(c.dimY / c.scaleY) + 1;
        _(n).times(function(j) {
            j -= 1;
            var midY = (j + 0.5) * c.scaleY;
            var leftX = x - c.picBoxWidth / 2;
            var topY = midY + 0.5 * c.scaleY;
            var coord = graphie.scalePoint([leftX, topY + bottomMargin]);
            var mouseRect = graphie.mouselayer.rect(
                    coord[0], coord[1], c.picBoxWidthPx, c.picBoxHeight);
            $(mouseRect[0])
                .css({fill: "#000", opacity: 0.0, cursor: "pointer"})
                .on("mousedown", function(e) {
                    self.mousedownPic = true;
                    self.setPicHeight(i, topY);
                    e.preventDefault();
                })
                .on("mouseover", function() {
                    if (self.mousedownPic) {
                        self.setPicHeight(i, topY);
                    }
                });

            if (j < 0) {
                // Don't show a pic underneath the axis!
                return;
            }
            pics[i][j] = createImage(x, midY + bottomMargin);
        });
        return x;
    },

    setPicHeight: function(i, y) {
        var values = _.clone(this.state.values);
        values[i] = y;
        this.drawPicHeights(values, this.state.values);
        this.setState({values: values});
        this.props.onChange({ values: values });
    },

    drawPicHeights: function(values, prevValues) {
        var self = this;
        var graphie = self.graphie;
        var pics = graphie.pics;
        _.each(pics, function(ps, i) {
            _.each(ps, function(pic, j) {
                var y = (j + 1) * self.props.scaleY;
                var show = y <= values[i];
                if (self.props.type === DOTPLOT) {
                    var wasShown = y <= prevValues[i];
                    var wasJustShown = show && !wasShown;
                    if (wasJustShown) {
                        pic.animate({
                            "stroke-width": 8
                        }, 75, function()  {return pic.animate({
                                "stroke-width": 2
                            }, 75);});
                    }
                }
                $(pic[0]).css({opacity: show ? 1.0 : 0.0});
            });
        });
    },

    toJSON: function(skipValidation) {
        return this.state.values;
    },

    simpleValidate: function(rubric) {
        return Plotter.validate(this.toJSON(), rubric);
    },
});

_.extend(Plotter, {
    validate: function (guess, rubric) {
        if (deepEq(guess, rubric.starting)) {
            return {
                type: "invalid",
                message: null
            };
        } else {
            return {
                type: "points",
                earned: deepEq(guess, rubric.correct) ? 1 : 0,
                total: 1,
                message: null
            };
        }
    }
});


// Return a copy of array with length n, padded with given value
function padArray(array, n, value) {
    var copy = _.clone(array);
    copy.length = n;
    for (var i = array.length; i < n; i++) {
        copy[i] = value;
    }
    return copy;
}

var editorDefaults = {
    scaleY: 1,
    maxY: 10,
    snapsPerLine: 2
};

var PlotterEditor = React.createClass({displayName: 'PlotterEditor',
    propTypes: widgetPropTypes,

    getDefaultProps: function () {
        return _.extend({}, editorDefaults, {
            correct: [1],
            starting: [1],

            type: BAR,
            labels: ["", ""],
            categories: [""],

            picSize: 30,
            picBoxHeight: 36,
            picUrl: Khan.imageBase + "badges/earth-small.png",

            plotDimensions: [275, 200],
            labelInterval: 1
        });
    },

    getInitialState: function() {
        return {
            editing: "correct"
        };
    },

    render: function() {
        var setFromScale = _.contains([LINE, HISTOGRAM, DOTPLOT],
                                      this.props.type);
        var canChangeSnaps = !_.contains([PIC, DOTPLOT], this.props.type);
        return React.DOM.div( {className:"perseus-widget-plotter-editor"}, 
            React.DOM.div(null, 
                "Chart type:",' ',
                _.map([BAR, LINE, PIC, HISTOGRAM, DOTPLOT], function(type) {
                    return React.DOM.label( {key:type}, 
                        React.DOM.input(
                            {type:"radio",
                            name:"chart-type",
                            checked:this.props.type === type,
                            onChange:_.partial(this.changeType, type)} ),
                        type
                    );
                }, this)
            ),
            React.DOM.div(null, 
                "Labels:",' ',
                _.map(["x", "y"], function(axis, i) {
                    return React.DOM.label( {key:axis}, 
                        axis + ":",
                        React.DOM.input(
                            {type:"text",
                            onChange:_.partial(this.changeLabel, i),
                            defaultValue:this.props.labels[i]} )
                    );
                }, this)
            ),
            setFromScale && React.DOM.div(null, 
                React.DOM.div(null, 
                    React.DOM.label(null, 
                        "Scale (x):",' ',
                        React.DOM.input(
                            {type:"text",
                            ref:"scaleX"} )
                    )
                ),
                React.DOM.div(null, 
                    React.DOM.label(null, 
                        "Max x:",' ',
                        React.DOM.input(
                            {type:"text",
                            ref:"maxX"} )
                    )
                ),
                React.DOM.div(null, 
                    React.DOM.label(null, 
                        "Label Interval:",' ',
                        NumberInput(
                            {value:this.props.labelInterval,
                            onChange:this.changeLabelInterval} )
                    )
                ),
                React.DOM.div(null, 
                    React.DOM.button( {onClick:this.setCategoriesFromScale}, 
                        "Set categories from scale",' '
                    ),
                    InfoTip(null, 
                      React.DOM.p(null, "Automatically sets categories according to the x-axis"+' '+
                      "scale and max values.")
                    )
                )
            ),
            this.props.type === PIC && React.DOM.div(null, 
                React.DOM.label(null, 
                    "Picture:",' ',
                    React.DOM.input(
                        {type:"text",
                        className:"pic-url",
                        defaultValue:this.props.picUrl,
                        onKeyPress:this.changePicUrl,
                        onBlur:this.changePicUrl} ),
                InfoTip(null, 
                    React.DOM.p(null, "Use the default picture of Earth, or insert the URL for"+' '+
                    "a different picture using the \"Add image\" function.")
                )
                )
            ),
            React.DOM.div(null, 
                React.DOM.label(null, 
                    "Categories:",' ',
                    TextListEditor(
                        {ref:"categories",
                        layout:"horizontal",
                        options:this.props.categories,
                        onChange:this.changeCategories} )
                )
            ),
            React.DOM.div(null, 
                React.DOM.label(null, 
                    "Scale (y):",' ',
                    React.DOM.input(
                        {type:"text",
                        onChange:this.changeScale,
                        defaultValue:this.props.scaleY} )
                )
            ),
            React.DOM.div(null, 
                React.DOM.label(null, 
                    "Max y:",' ',
                    React.DOM.input(
                        {type:"text",
                        ref:"maxY",
                        onChange:this.changeMax,
                        defaultValue:this.props.maxY} )
                )
            ),
            canChangeSnaps && React.DOM.div(null, 
                React.DOM.label(null, 
                    "Snaps per line:",' ',
                    React.DOM.input(
                        {type:"text",
                        onChange:this.changeSnaps,
                        defaultValue:this.props.snapsPerLine} )
                ),
                InfoTip(null, 
                    React.DOM.p(null, "Creates the specified number of divisions between the"+' '+
                    "horizontal lines. Fewer snaps between lines makes the graph"+' '+
                    "easier for the student to create correctly.")
                )
            ),
            React.DOM.div(null, 
                "Editing values:",' ',
                _.map(["correct", "starting"], function(editing) {
                    return React.DOM.label( {key:editing}, 
                        React.DOM.input(
                            {type:"radio",
                            name:"editing",
                            checked:this.state.editing === editing,
                            onChange:_.partial(this.changeEditing, editing)}),
                        editing
                    );
                }, this),
                InfoTip(null, React.DOM.p(null, 
                    "Use this toggle to switch between editing the correct"+' '+
                    "answer (what the student will be graded on) and the"+' '+
                    "starting values (what the student will see plotted when"+' '+
                    "they start the problem). Note: These cannot be the same."
                ))
            ),
            this.transferPropsTo(
                Plotter(
                    {starting:this.props[this.state.editing],
                    onChange:this.handlePlotterChange} )
            )
        );
    },

    changeLabelInterval: function(value) {
        this.props.onChange({
            labelInterval: value
        });
    },

    handlePlotterChange: function(newProps) {
        var props = {};
        props[this.state.editing] = newProps.values;
        this.props.onChange(props);
    },

    changeType: function(type) {
        var categories;
        if (type === HISTOGRAM) {
            // Switching to histogram, add a label (0) to the left
            categories = [formatNumber(0)].concat(this.props.categories);
            this.props.onChange({type: type, categories: categories});
        } else if (this.props.type === HISTOGRAM) {
            // Switching from histogram, remove a label from the left
            categories = this.props.categories.slice(1);
            this.props.onChange({type: type, categories: categories});
        } else {
            this.props.onChange({type: type});
        }

        if (categories) {
            this.refs.categories.getDOMNode().value = categories.join(", ");
        }
    },

    changeLabel: function(i, e) {
        var labels = _.clone(this.props.labels);
        labels[i] = e.target.value;
        this.props.onChange({labels: labels});
    },

    changePicUrl: function(e) {
        // Only continue on blur or "enter"
        if (e.type === "keypress" && e.keyCode !== 13) {
            return;
        }

        this.props.onChange({picUrl: e.target.value});
    },

    changeCategories: function(categories) {
        var n = categories.length;
        if (this.props.type === HISTOGRAM) {
            // Histograms with n labels/categories have n - 1 buckets
            n--;
        }
        var value = this.props.scaleY;

        this.props.onChange({
            categories: categories,
            correct: padArray(this.props.correct, n, value),
            starting: padArray(this.props.starting, n, value)
        });
    },

    changeScale: function(e) {
        var oldScale = this.props.scaleY;
        var newScale = +e.target.value || editorDefaults.scaleY;

        var scale = function(value) {
            return value * newScale / oldScale;
        };

        var maxY = scale(this.props.maxY);

        this.props.onChange({
            scaleY: newScale,
            maxY: maxY,
            correct: _.map(this.props.correct, scale),
            starting: _.map(this.props.starting, scale)
        });

        this.refs.maxY.getDOMNode().value = maxY;
    },

    changeMax: function(e) {
        this.props.onChange({
            maxY: +e.target.value || editorDefaults.maxY
        });
    },

    changeSnaps: function(e) {
        this.props.onChange({
            snapsPerLine: +e.target.value || editorDefaults.snapsPerLine
        });
    },

    changeEditing: function(editing) {
        this.setState({editing: editing});
    },

    setCategoriesFromScale: function() {
        var scale = +this.refs["scaleX"].getDOMNode().value;
        var max = +this.refs["maxX"].getDOMNode().value;
        max = Math.ceil(max / scale) * scale;

        var categories;
        if (this.props.type === HISTOGRAM || this.props.type === DOTPLOT) {
            // Ranges for histogram and dotplot labels should start at zero
            categories = _.range(0, max + scale, scale);
        } else {
            categories = _.range(scale, max + scale, scale);
        }

        categories = _.map(categories, formatNumber);

        this.changeCategories(categories);

        this.refs.categories.getDOMNode().value = categories.join(", ");
    },

    toJSON: function(skipValidation) {
        var json = _.pick(this.props, "correct", "starting", "type", "labels",
            "categories", "scaleY", "maxY", "snapsPerLine", "labelInterval");

        if (this.props.type === PIC) {
            json.picUrl = this.props.picUrl;
        }

        return json;
    }
});

Widgets.register("plotter", Plotter);
Widgets.register("plotter-editor", PlotterEditor);

})(Perseus);

},{"../components/info-tip.jsx":8,"../components/number-input.jsx":9,"../components/text-list-editor.jsx":13,"../core.js":15,"../util.js":38,"../widgets.js":39}],52:[function(require,module,exports){
/** @jsx React.DOM */
(function(Perseus) {

require("../core.js");
var Util = require("../util.js");
require("../renderer.jsx");
require("../editor.jsx");

var InfoTip = require("../components/info-tip.jsx");
var Widgets = require("../widgets.js");

var shuffle = Util.shuffle;

var BaseRadio = React.createClass({displayName: 'BaseRadio',
    render: function() {
        var radioGroupName = _.uniqueId("perseus_radio_");
        var inputType = this.props.multipleSelect ? "checkbox" : "radio";

        return React.DOM.ul( {className:"perseus-widget-radio " +
                "above-scratchpad blank-background"}, 
            this.props.multipleSelect &&
                React.DOM.div( {className:"instructions"}, 
                    $_(null, "Select all that apply.")
                ),
            this.props.choices.map(function(choice, i) {

                var content = React.DOM.div(null, 
                        React.DOM.span( {className:"checkbox"}, 
                            React.DOM.input(
                                {ref:"radio" + i,
                                type:inputType,
                                name:radioGroupName,
                                checked:choice.checked,
                                onChange:this.onChange.bind(this, i)} )
                        ),
                        choice.content,
                        this.props.showClues && choice.checked &&
                            React.DOM.div( {className:"perseus-radio-clue"}, 
                                choice.clue
                            )
                    );

                if (this.props.labelWrap) {
                    return React.DOM.li(null, 
                        React.DOM.label( {className:"interactive-component"}, 
                            content
                        )
                    );
                } else {
                    return React.DOM.li(null, content);
                }

            }, this)
        );
    },

    onChange: function(radioIndex, e) {
        var newChecked = _.map(this.props.choices, function(choice, i) {
            return this.refs["radio" + i].getDOMNode().checked;
        }, this);

        this.props.onCheckedChange(newChecked);
    },

    focus: function(i) {
        this.refs["radio" + (i || 0)].getDOMNode().focus();
        return true;
    }
});

var Radio = React.createClass({displayName: 'Radio',
    getDefaultProps: function() {
        return {
            choices: [{}],
            randomize: false,
            multipleSelect: false
        };
    },

    getInitialState: function() {
        return {
            showClues: false
        };
    },

    render: function() {
        var values = this.props.values || _.map(this.props.choices,
                function() {
            return false;
        });

        var choices = this.props.choices.map(function(choice, i) {
            return {
                // We need to make a copy, which _.pick does
                content: Perseus.Renderer(_.pick(choice, "content")),
                checked: values[i],
                clue: Perseus.Renderer({content: choice.clue}),
                originalIndex: i
            };
        });
        choices = this.randomize(choices);

        return BaseRadio(
            {ref:"baseRadio",
            labelWrap:true,
            multipleSelect:this.props.multipleSelect,
            showClues:this.state.showClues,
            choices:choices.map(function(choice) {
                return _.pick(choice, "content", "checked", "clue");
            }),
            onCheckedChange:this.onCheckedChange} );
    },

    focus: function(i) {
        return this.refs.baseRadio.focus(i);
    },

    onCheckedChange: function(checked) {
        this.setState({showClues: false});
        this.props.onChange({
            values: this.derandomize(checked)
        });
    },

    toJSON: function(skipValidation) {
        // Return checked inputs in the form {values: [bool]}. (Dear future
        // timeline implementers: this used to be {value: i} before multiple
        // select was added)
        if (this.props.values) {
            return _.pick(this.props, "values");
        } else {
            // Nothing checked
            return {
                values: _.map(this.props.choices, function() {
                    return false;
                })
            };
        }
    },

    simpleValidate: function(rubric) {
        this.setState({showClues: true});
        return Radio.validate(this.toJSON(), rubric);
    },

    randomize: function(array) {
        if (this.props.randomize && this.props.problemNum) {
            return shuffle(array, this.props.problemNum);
        } else {
            return array;
        }
    },

    derandomize: function(array) {
        if (this.props.randomize && this.props.problemNum) {
            var map = shuffle(_.range(array.length), this.props.problemNum);
            var derandomized = new Array(array.length);
            _.each(map, function(shuffledIndex, originalIndex) {
                derandomized[shuffledIndex] = array[originalIndex];
            });
            return derandomized;
        } else {
            return array;
        }
    }
});

_.extend(Radio, {
    validate: function(state, rubric) {
        if (!_.any(state.values)) {
            return {
                type: "invalid",
                message: null
            };
        } else {
            /* jshint -W018 */
            var correct = _.all(state.values, function(selected, i) {
                return !!rubric.choices[i].correct === selected;
            });
            /* jshint +W018 */

            return {
                type: "points",
                earned: correct ? 1 : 0,
                total: 1,
                message: null
            };
        }
    }
});

var RadioEditor = React.createClass({displayName: 'RadioEditor',
    getDefaultProps: function() {
        return {
            choices: [{}, {}],
            randomize: false,
            multipleSelect: false
        };
    },

    render: function() {
        return React.DOM.div(null, 
            React.DOM.div( {className:"perseus-widget-row"}, 

                React.DOM.div( {className:"perseus-widget-left-col"}, React.DOM.label(null, 
                    React.DOM.input( {type:"checkbox",
                           checked:this.props.multipleSelect,
                           onChange:this.onMultipleSelectChange} ),
                    ' ',"Multiple selections",' '
                )),

                React.DOM.div( {className:"perseus-widget-right-col"}, React.DOM.label(null, 
                    React.DOM.input( {type:"checkbox",
                           checked:this.props.randomize,
                           onChange:function(e)  {return this.props.onChange(
                            {randomize: e.target.checked});}.bind(this)} ),
                    ' ',"Randomize order",' '
                ),
                InfoTip(null, 
                    React.DOM.p(null, "For this option to work, don’t label choices or have"+' '+
                    "\"None of the above\" as an option. For true/false questions,"+' '+
                    "make the first choice True and the second choice False,"+' '+
                    "and do NOT select randomize answer order.")
                )
                )
            ),

            BaseRadio(
                {ref:"baseRadio",
                multipleSelect:this.props.multipleSelect,
                labelWrap:false,
                choices:this.props.choices.map(function(choice, i) {
                    var checkedClass = choice.correct ?
                        "correct" :
                        "incorrect";
                    var editor = Perseus.Editor({
                        ref: "editor" + i,
                        content: choice.content || "",
                        widgetEnabled: false,
                        placeholder: "Type a choice here...",
                        onChange: function(newProps)  {
                            if ("content" in newProps) {
                                this.onContentChange(i, newProps.content);
                            }}.bind(this)
                    });
                    var clueEditor = Perseus.Editor({
                        ref: "clue-editor-" + i,
                        content: choice.clue || "",
                        widgetEnabled: false,
                        placeholder: $._("Why is this choice " +
                            checkedClass + "?"),
                        onChange: function(newProps)  {
                            if ("content" in newProps) {
                                this.onClueChange(i, newProps.content);
                            }}.bind(this)
                    });
                    var deleteLink = React.DOM.a( {href:"#",
                            className:"simple-button orange delete-choice",
                            title:"Remove this choice",
                            onClick:this.onDelete.bind(this, i)}, 
                        React.DOM.span( {className:"icon-trash"} )
                    );
                    return {
                        content: React.DOM.div( {className:"choice-clue-editors"}, 
                            React.DOM.div( {className:"choice-editor " + checkedClass}, 
                                editor
                            ),
                            /* TODO(eater): Remove this condition after clues
                                            are fully launched. */
                            (!window.KA || window.KA.allowEditingClues) &&
                                React.DOM.div( {className:"clue-editor"}, 
                                    clueEditor
                                ),
                            
                            this.props.choices.length >= 2 && deleteLink
                        ),
                        checked: choice.correct
                    };
                }, this),
                onCheckedChange:this.onCheckedChange} ),

            React.DOM.div( {className:"add-choice-container"}, 
                React.DOM.a( {href:"#", className:"simple-button orange",
                        onClick:this.addChoice}, 
                    React.DOM.span( {className:"icon-plus"} ),
                    ' ',"Add a choice",' '
                )
            )

        );
    },

    onMultipleSelectChange: function(e) {

        var allowMultiple = e.target.checked;

        var numSelected = _.reduce(this.props.choices,
                function(memo, choice) {
            return choice.correct ? memo + 1 : memo;
        }, 0);

        if (!allowMultiple && numSelected > 1) {
            var choices = _.map(this.props.choices, function(choice) {
                return _.defaults({
                    correct: false
                }, choice);
            });
            this.props.onChange({
                multipleSelect: allowMultiple,
                choices: choices
            });

        } else {
            this.props.onChange({
                multipleSelect: allowMultiple
            });
        }
    },

    onCheckedChange: function(checked) {
        var choices = _.map(this.props.choices, function(choice, i) {
            return _.extend({}, choice, {correct: checked[i]});
        });
        this.props.onChange({choices: choices});
    },

    onContentChange: function(choiceIndex, newContent) {
        var choices = this.props.choices.slice();
        choices[choiceIndex] = _.extend({}, choices[choiceIndex], {
            content: newContent
        });
        this.props.onChange({choices: choices});
    },

    onClueChange: function(choiceIndex, newClue) {
        var choices = this.props.choices.slice();
        choices[choiceIndex] = _.extend({}, choices[choiceIndex], {
            clue: newClue
        });
        if (newClue === "") {
            delete choices[choiceIndex].clue;
        }
        this.props.onChange({choices: choices});
    },

    onDelete: function(choiceIndex, e) {
        e.preventDefault();
        var choices = this.props.choices.slice();
        choices.splice(choiceIndex, 1);
        this.props.onChange({choices: choices});
    },

    addChoice: function(e) {
        e.preventDefault();

        var choices = this.props.choices;
        this.props.onChange({choices: choices.concat([{}])}, function() {
            this.refs["editor" + choices.length].focus();
        }.bind(this));
    },

    focus: function() {
        this.refs.editor0.focus();
        return true;
    },

    toJSON: function(skipValidation) {
        if (!skipValidation &&
                !_.some(_.pluck(this.props.choices, "correct"))) {
            alert("Warning: No choice is marked as correct.");
        }

        return _.pick(this.props, "choices", "randomize", "multipleSelect");
    }
});

Widgets.register("radio", Radio);
Widgets.register("radio-editor", RadioEditor);

})(Perseus);

},{"../components/info-tip.jsx":8,"../core.js":15,"../editor.jsx":22,"../renderer.jsx":36,"../util.js":38,"../widgets.js":39}],53:[function(require,module,exports){
/** @jsx React.DOM */
(function(Perseus) {

require("../core.js");
var Util = require("../util.js");

var shuffle = Util.shuffle;

var InfoTip        = require("../components/info-tip.jsx");
var PropCheckBox   = require("../components/prop-check-box.jsx");
var Sortable       = require("../components/sortable.jsx");
var TextListEditor = require("../components/text-list-editor.jsx");
var Widgets        = require("../widgets.js");

var HORIZONTAL = "horizontal",
    VERTICAL = "vertical";

var Sorter = React.createClass({displayName: 'Sorter',
    propTypes: {
        correct: React.PropTypes.array,
        layout: React.PropTypes.oneOf([HORIZONTAL, VERTICAL]),
        padding: React.PropTypes.bool,
        problemNum: React.PropTypes.number,
        onChange: React.PropTypes.func
    },

    getDefaultProps: function() {
        return {
            correct: [],
            layout: HORIZONTAL,
            padding: true,
            problemNum: 0,
            onChange: function() {}
        };
    },

    render: function() {
        var options = shuffle(
            this.props.correct,
            this.props.problemNum,
            /* ensurePermuted */ true
        );

        return React.DOM.div( {className:"perseus-widget-sorter ui-helper-clearfix"}, 
            Sortable(
                {options:options,
                layout:this.props.layout,
                padding:this.props.padding,
                onChange:this.props.onChange,
                ref:"sortable"} )
        );
    },

    toJSON: function(skipValidation) {
        return {options: this.refs.sortable.getOptions()};
    },

    simpleValidate: function(rubric) {
        return Sorter.validate(this.toJSON(), rubric);
    },
});


_.extend(Sorter, {
    validate: function(state, rubric) {
        var correct = _.isEqual(state.options, rubric.correct);

        return {
            type: "points",
            earned: correct ? 1 : 0,
            total: 1,
            message: null
        };
    }
});


var SorterEditor = React.createClass({displayName: 'SorterEditor',
    propTypes: {
        correct: React.PropTypes.array,
        layout: React.PropTypes.oneOf([HORIZONTAL, VERTICAL]),
        padding: React.PropTypes.bool
    },

    getDefaultProps: function() {
        return {
            correct: ["$x$", "$y$", "$z$"],
            layout: HORIZONTAL,
            padding: true
        };
    },

    render: function() {
        var editor = this;

        return React.DOM.div(null, 
            React.DOM.div(null, 
                ' ',"Correct answer:",' ',
                InfoTip(null, React.DOM.p(null, 
                    "Enter the correct answer (in the correct order) here. The"+' '+
                    "preview on the right will have the cards in a randomized"+' '+
                    "order, which is how the student will see them."
                ))
            ),
            TextListEditor(
                {options:this.props.correct,
                onChange:function(options, cb) {
                    editor.props.onChange({correct: options}, cb);
                },
                layout:this.props.layout} ),
            React.DOM.div(null, 
                React.DOM.label(null, 
                    ' ',"Layout:",' ',
                    React.DOM.select( {value:this.props.layout,
                            onChange:this.onLayoutChange}, 
                        React.DOM.option( {value:HORIZONTAL}, "Horizontal"),
                        React.DOM.option( {value:VERTICAL}, "Vertical")
                    )
                ),
                InfoTip(null, 
                    React.DOM.p(null, "Use the horizontal layout for short text and small"+' '+
                    "images. The vertical layout is best for longer text and"+' '+
                    "larger images.")
                )
            ),
            React.DOM.div(null, 
                PropCheckBox(
                    {label:"Padding:",
                    padding:this.props.padding,
                    onChange:this.props.onChange} ),
                InfoTip(null, 
                    React.DOM.p(null, "Padding is good for text, but not needed for images.")
                )
            )
        );
    },

    onLayoutChange: function(e) {
        this.props.onChange({layout: e.target.value});
    },

    toJSON: function(skipValidation) {
        return _.pick(this.props, "correct", "layout", "padding");
    }
});

Widgets.register("sorter", Sorter);
Widgets.register("sorter-editor", SorterEditor);

})(Perseus);

},{"../components/info-tip.jsx":8,"../components/prop-check-box.jsx":10,"../components/sortable.jsx":12,"../components/text-list-editor.jsx":13,"../core.js":15,"../util.js":38,"../widgets.js":39}],54:[function(require,module,exports){
/** @jsx React.DOM */
(function(Perseus) {

require("../core.js");
var Util = require("../util.js");
require("../editor.jsx");
require("../renderer.jsx");
var InfoTip = require("../components/info-tip.jsx");

var Widgets = require("../widgets.js");
var Editor  = Perseus.Editor;


var Table = React.createClass({displayName: 'Table',
    render: function() {
        var headers = this.props.headers;
        return React.DOM.table( {className:"perseus-widget-table-of-values non-markdown"}, 
            React.DOM.thead(null, 
                React.DOM.tr(null, 
                    _.map(headers, function(header) {
                        return React.DOM.th(null, Perseus.Renderer({content: header}));
                    })
                
                )
            ),
            React.DOM.tbody(null, 
                _(this.props.rows).times(function(r) {
                    return React.DOM.tr(null, 
                        _(this.props.columns).times(function(c)  {
                            return React.DOM.td(null, 
                                React.DOM.input(
                                    {ref:"answer" + r + "," + c,
                                    type:"text",
                                    onChange:this.handleChange}
                                )
                            );
                        }.bind(this))
                    );
                }.bind(this))
            
            )
        );
    },

    toJSON: function() {
        var self = this;
        return _.map(self.props.answers, function(answer, r) {
            return _.map(self.props.headers, function(header, c) {
                return self.refs["answer" + r + "," + c].getDOMNode().value;
            });
        });
    },

    handleChange: function() {
        // HACK: We need to know *that* the widget changed, but currently it's
        // not set up in a nice way to tell us *how* it changed
        this.props.onChange({});
    },

    simpleValidate: function(rubric) {
        return Table.validate(this.toJSON(), rubric);
    },

    focus: function() {
        this.refs["answer0,0"].getDOMNode().focus();
        return true;
    }
});

_.extend(Table, {
    validate: function(state, rubric) {
        var filterNonEmpty = function (table) {
            return _.filter(table, function (row) {

                // Check if row has a cell that is nonempty
                return _.some(row, _.identity);
            });
        };
        var solution = filterNonEmpty(rubric.answers);
        var supplied = filterNonEmpty(state);
        var hasEmptyCell = _.some(supplied, function(row) {
            return _.some(row, function(cell) {
                return cell === "";
            });
        });
        if (hasEmptyCell || !supplied.length) {
            return {
                type: "invalid",
                message: null
            };
        }
        if (supplied.length !== solution.length) {
            return {
                type: "points",
                earned: 0,
                total: 1,
                message: null
            };
        }
        var createValidator = Khan.answerTypes
                                  .number.createValidatorFunctional;
        var message = null;
        var allCorrect = _.every(solution, function (rowSolution) {
            var i;
            for (i = 0; i < supplied.length; i++) {
                var rowSupplied = supplied[i];
                var correct = _.every(rowSupplied, function (cellSupplied, i) {
                    var cellSolution = rowSolution[i];
                    var validator = createValidator(
                            cellSolution, {
                                simplify: true
                            });
                    var result = validator(cellSupplied);
                    if (result.message) {
                        message = result.message;
                    }
                    return result.correct;
                });
                if (correct) {
                    supplied.splice(i, 1);
                    return true;
                }
            }
            return false;
        });
        return {
            type: "points",
            earned: allCorrect ? 1 : 0,
            total: 1,
            message: message
        };
    }
});

var TableEditor = React.createClass({displayName: 'TableEditor',
    getDefaultProps: function() {
        var defaultRows = 4;
        var defaultColumns = 1;
        var blankAnswers = _(defaultRows).times(function() {
            return Util.stringArrayOfSize(defaultColumns);
        });
        return {
            headers: [""],
            rows: defaultRows,
            columns: defaultColumns,
            numRawRows: defaultRows,
            numRawColumns: defaultColumns,
            answers: blankAnswers,
            type: "set"
        };
    },

    focus: function() {
        this.refs.numberOfColumns.getDOMNode().focus();
    },

    render: function() {
        var self = this;
        var rows = this.props.rows;
        var cols = this.props.columns;
        return React.DOM.div(null, 
            React.DOM.div(null, 
                React.DOM.label(null, 
                    ' ',"Number of columns:",' ',
                    React.DOM.input(
                        {ref:"numberOfColumns",
                        type:"text",
                        value:this.props.numRawColumns,
                        onChange:this.onSizeInput}
                    )
                )
            ),
            React.DOM.div(null, 
                React.DOM.label(null, 
                    ' ',"Number of rows:",' ',
                    React.DOM.input(
                        {ref:"numberOfRows",
                        type:"text",
                        value:this.props.numRawRows,
                        onChange:this.onSizeInput}
                    )
                )
            ),
            React.DOM.div(null, 
                ' ',"Table of answers type:",' ',
                React.DOM.ul(null, 
                    React.DOM.li(null, 
                        React.DOM.label(null, 
                            React.DOM.input(
                                {type:"radio",
                                checked:"checked"}
                            ),
                            ' ',"Set of values (complete)",' '
                        ),
                        InfoTip(null, 
                            React.DOM.p(null, "The student has to fill out all cells in the"+' '+
                            "table.  For partially filled tables create a table"+' '+
                            "using the template, and insert text input boxes"+' '+
                            "as desired.")
                        )
                    )
                )
            ),
            React.DOM.div(null, 
                React.DOM.table( {className:"perseus-widget-table-of-values non-markdown"}, 
                    React.DOM.thead(null, 
                        React.DOM.tr(null, 
                            _(cols).times(function(i) {
                                return React.DOM.th(null, 
                                    Editor(
                                        {ref:"columnHeader" + i,
                                        content:self.props.headers[i],
                                        widgetEnabled:false,
                                        onChange:
                                            self.onHeaderChange.bind(self, i)
                                        }
                                    )
                                );
                            })
                        )
                    ),
                    React.DOM.tbody(null, 
                        _(rows).times(function(r) {
                            return React.DOM.tr(null, 
                                _(cols).times(function(c) {
                                    return React.DOM.td(null, 
                                        React.DOM.input(
                                            {ref:"answer" + r + "," + c,
                                            type:"text",
                                            onChange:self.onAnswerInput,
                                            value:self.props.answers[r][c]}
                                        )
                                    );
                                })
                            );
                        })
                    )
                )
            )
        );
    },

    onHeaderChange: function(index, newProps) {
        if (_.has(newProps, "content")) {
            var headers = this.props.headers.slice();
            headers[index] = newProps.content;
            this.props.onChange({headers: headers});
        }
    },

    onSizeInput: function() {
        var numRawRows = this.refs.numberOfRows.getDOMNode().value;
        var numRawCols = this.refs.numberOfColumns.getDOMNode().value;
        var rows = +numRawRows || 0;
        var cols = +numRawCols || 0;
        rows = Math.min(Math.max(1, rows), 30);
        cols = Math.min(Math.max(1, cols), 6);
        var oldColumns = this.props.columns;
        var oldRows = this.props.rows;

        var answers = this.props.answers;
        if (oldRows < rows) {
            _(rows - oldRows).times(function() {
                answers.push(Util.stringArrayOfSize(oldColumns));
            });
        }

        var headers = this.props.headers;

        function fixColumnSizing(array) {
            _(cols - oldColumns).times(function() {
                array.push("");
            });
        }

        if (oldColumns < cols) {
            fixColumnSizing(headers);
            _.each(answers, fixColumnSizing);
        }

        this.props.onChange({
            rows: rows,
            columns: cols,
            numRawRows: numRawRows,
            numRawColumns: numRawCols,
            answers: answers,
            headers: headers
        });
    },

    onAnswerInput: function() {
        var self = this;
        var answers = _(self.props.rows).times(function(r) {
            return _(self.props.columns).times(function(c) {
                return self.refs["answer" + r + "," + c].getDOMNode().value;
            });
        });
        this.props.onChange({answers: answers});
    },

    toJSON: function() {
        var self = this;
        var answers = this.props.answers.slice(0, this.props.rows);
        answers = _.map(answers, function(row) {
            return row.slice(0, self.props.columns);
        });
        var json = _.pick(this.props, 'rows', 'columns');
        json.answers = answers;
        json.headers = this.props.headers.slice(0, this.props.columns);
        return json;
    }
});

Widgets.register("table", Table);
Widgets.register("table-editor", TableEditor);

})(Perseus);

},{"../components/info-tip.jsx":8,"../core.js":15,"../editor.jsx":22,"../renderer.jsx":36,"../util.js":38,"../widgets.js":39}],55:[function(require,module,exports){
/** @jsx React.DOM */

require("../core.js");
var Util = require("../util.js");
var Widgets = require("../widgets.js");

var InfoTip = require("../components/info-tip.jsx");
var NumberInput = require("../components/number-input.jsx");

var answerTypes = {
    number: {
        name: "Numbers",
        forms: "integer, decimal, proper, improper, mixed"
    },
    decimal: {
        name: "Decimals",
        forms: "decimal"
    },
    integer: {
        name: "Integers",
        forms: "integer"
    },
    rational: {
        name: "Fractions and mixed numbers",
        forms: "integer, proper, improper, mixed"
    },
    improper: {
        name: "Improper numbers (no mixed)",
        forms: "integer, proper, improper"
    },
    mixed: {
        name: "Mixed numbers (no improper)",
        forms: "integer, proper, mixed"
    },
    percent: {
        name: "Numbers or percents",
        forms: "integer, decimal, proper, improper, mixed, percent"
    },
    pi: {
        name: "Numbers with pi", forms: "pi"
    }
};

var formExamples = {
    "integer": function(options) { return $._("an integer, like $6$"); },
    "proper": function(options) {
        if (options.simplify === "optional") {
            return $._("a *proper* fraction, like $1/2$ or $6/10$");
        } else {
            return $._("a *simplified proper* fraction, like $3/5$");
        }
    },
    "improper": function(options) {
        if (options.simplify === "optional") {
            return $._("an *improper* fraction, like $10/7$ or $14/8$");
        } else {
            return $._("a *simplified improper* fraction, like $7/4$");
        }
    },
    "mixed": function(options) {
        return $._("a mixed number, like $1\\ 3/4$");
    },
    "decimal": function(options) {
        return $._("an *exact* decimal, like $0.75$");
    },
    "percent": function(options) {
        return $._("a percent, like $12.34\\%$");
    },
    "pi": function(options) {
        return $._("a multiple of pi, like $12\\ \\text{pi}$ or " +
                "$2/3\\ \\text{pi}$");
    }
};

var TextInput = React.createClass({displayName: 'TextInput',
    render: function() {
        // TODO(jack): Probably make this sync up with its props
        return React.DOM.input( {type:"text", className:"interactive-component" +
                "perseus-input-size-" + (this.props.size || "normal")} );
    },

    focus: function() {
        this.getDOMNode().focus();
        return true;
    },

    toJSON: function(skipValidation) {
        return {
            value: this.getDOMNode().value
        };
    },

    simpleValidate: function(rubric) {
        return TextInput.validate(this.toJSON(), rubric);
    },

    examples: function() {
        var type = this.props.answerType || "number";
        var forms = answerTypes[type].forms.split(/\s*,\s*/);

        var examples = _.map(forms, function(form) {
            return formExamples[form](this.props);
        }, this);

        return examples;
    }
});

_.extend(TextInput, {
    validate: function(state, rubric) {
        if (rubric.answerType == null) {
            rubric.answerType = "number";
        }
        var val = Khan.answerTypes.number.createValidatorFunctional(
            rubric.value, {
                simplify: rubric.simplify,
                inexact: rubric.inexact || undefined,
                maxError: rubric.maxError,
                forms: answerTypes[rubric.answerType].forms
            });

        var result = val(state.value);

        // TODO(eater): Seems silly to translate result to this invalid/points
        // thing and immediately translate it back in ItemRenderer.scoreInput()
        if (result.empty) {
            return {
                type: "invalid",
                message: result.message
            };
        } else {
            return {
                type: "points",
                earned: result.correct ? 1 : 0,
                total: 1,
                message: result.message
            };
        }
    }
});

var TextInputEditor = React.createClass({displayName: 'TextInputEditor',
    getDefaultProps: function() {
        return {
            value: null,
            simplify: "required",
            size: "normal",
            inexact: false,
            maxError: null,
            answerType: "number"
        };
    },

    handleAnswerChange: function(str) {
        var value = Util.firstNumericalParse(str) || 0;
        this.props.onChange({value: value});
    },

    render: function() {
        var answerTypeOptions = _.map(answerTypes, function(v, k) {
            return React.DOM.option( {value:k}, v.name);
        }, this);

        return React.DOM.div( {className:"perseus-input-number-editor"}, 
            React.DOM.div(null, React.DOM.label(null, 
                ' ',"Correct answer:",' ',
                NumberInput( {value:this.props.value,
                           onChange:this.handleAnswerChange,
                           ref:"input"} )
                ),
                ' ', " ± ", ' ',
                NumberInput( {className:"max-error",
                    value:  this.props.maxError,
                    onChange:function(maxError)  {
                        inexact = maxError != null && maxError !== 0;
                        this.props.onChange({
                            inexact: inexact,
                            maxError: maxError
                        });
                    }.bind(this),
                    placeholder:"0",
                    ref:"input"} )
            ),

            React.DOM.div(null, 
                React.DOM.label(null, 
                    ' ',"Unsimplified answers",' ',
                    React.DOM.select( {value:this.props.simplify,
                            onChange:function(e) {
                                this.props.onChange({simplify:
                                e.target.value});
                            }.bind(this)}, 
                        React.DOM.option( {value:"required"}, "will not be graded"),
                        React.DOM.option( {value:"optional"}, "will be accepted"),
                        React.DOM.option( {value:"enforced"}, "will be marked wrong")
                    )
                ),
                InfoTip(null, 
                    React.DOM.p(null, "Normally select \"will not be graded\". This will give the"+' '+
                    "user a message saying the answer is correct but not"+' '+
                    "simplified. The user will then have to simplify it and"+' '+
                    "re-enter, but will not be penalized. (5th grade and"+' '+
                    "anything after)"),
                    React.DOM.p(null, "Select \"will be accepted\" only if the user is not"+' '+
                    "expected to know how to simplify fractions yet. (Anything"+' '+
                    "prior to 5th grade)"),
                    React.DOM.p(null, "Select \"will be marked wrong\" only if we are"+' '+
                    "specifically assessing the ability to simplify.")
                )
            ),

            React.DOM.div(null, 
            ' ',"Answer type:",' ',
            React.DOM.select(
                {value:this.props.answerType,
                onChange:function(e) {
                    this.props.onChange({answerType: e.target.value});
                }.bind(this)}, 
                answerTypeOptions
            ),
            InfoTip(null, 
                React.DOM.p(null, "Use the default \"Numbers\" unless the answer must be in a"+' '+
                "specific form (e.g., question is about converting decimals to"+' '+
                "fractions).")
            )
            ),

            React.DOM.div(null, 
                React.DOM.label(null, 
                    ' ',"Width",' ',
                    React.DOM.select( {value:this.props.size,
                            onChange:function(e) {
                                this.props.onChange({size: e.target.value});
                            }.bind(this)}, 
                        React.DOM.option( {value:"normal"}, "Normal (80px)"),
                        React.DOM.option( {value:"small"}, "Small (40px)")
                    )
                ),
                InfoTip(null, 
                    React.DOM.p(null, "Use size \"Normal\" for all text boxes, unless there are"+' '+
                    "multiple text boxes in one line and the answer area is too"+' '+
                    "narrow to fit them.")
                )
            )
        );
    },

    focus: function() {
        this.refs.input.getDOMNode().focus();
        return true;
    },

    toJSON: function() {
        return _.pick(this.props, "value", "simplify", "size",
            "inexact", "maxError", "answerType");
    }
});

Widgets.register("text-input", TextInput);
Widgets.register("text-input-editor", TextInputEditor);

},{"../components/info-tip.jsx":8,"../components/number-input.jsx":9,"../core.js":15,"../util.js":38,"../widgets.js":39}],56:[function(require,module,exports){
/** @jsx React.DOM */
(function(Perseus) {

require("../core.js");
var Util = require("../util.js");

var Graph         = require("../components/graph.jsx");
var GraphSettings = require("../components/graph-settings.jsx");
var InfoTip       = require("../components/info-tip.jsx");
var NumberInput   = require("../components/number-input.jsx");
var PropCheckBox  = require("../components/prop-check-box.jsx");
var TeX           = require("../tex.jsx");
var Widgets       = require("../widgets.js");

var ROTATE_SNAP_DEGREES = 15;
var DEGREE_SIGN = "\u00B0";
var RENDER_TRANSFORM_DELAY_IN_MS = 300;
var ROTATE_HANDLE_DIST = 1.5;
var REFLECT_ROTATE_HANDLE_DIST = 2;
var REFLECT_BUTTON_SIZE = 1;

var deepEq = Util.deepEq;
var knumber = KhanUtil.knumber;
var kvector = KhanUtil.kvector;
var kpoint = KhanUtil.kpoint;
var kray = KhanUtil.kray;
var kline = KhanUtil.kline;

var defaultBoxSize = 400;
var defaultBackgroundImage = {
    url: null,
    scale: 1,
    bottom: 0,
    left: 0,
};

function arraySum(array) {
    return _.reduce(array, function(memo, arg) { return memo + arg; }, 0);
}

/* Does a pluck on keys inside objects in an object
 *
 * Ex:
 * tools = {
 *     translation: {
 *         enabled: true
 *     },
 *     rotation: {
 *         enabled: false
 *     }
 * };
 * pluckObject(tools, "enabled") returns {
 *     translation: true
 *     rotation: false
 * }
 */
function pluckObject(object, subKey) {
    return _.object(_.map(object, function (value, key) {
        return [key, value[subKey]];
    }));
}

var defaultGraphProps = function(setProps, boxSize) {
    setProps = setProps || {};
    var labels = setProps.labels || ["x", "y"];
    var range = setProps.range || [[-10, 10], [-10, 10]];
    var step = setProps.step || [1, 1];
    var gridStep = setProps.gridStep ||
               Util.getGridStep(range, step, boxSize);
    return {
        box: [boxSize, boxSize],
        labels: labels,
        range: range,
        step: step,
        gridStep: gridStep,
        valid: true,
        backgroundImage: defaultBackgroundImage,
        markings: "grid",
        showProtractor: false
    };
};

var defaultTransformerProps = {
    gradeEmpty: false,
    graphMode: "interactive",
    listMode: "dynamic",
    tools: {
        translation: {
            enabled: true,
            required: false,
            constraints: {}
        },
        rotation: {
            enabled: true,
            required: false,
            constraints: {
                fixed: false
            },
            coord: [1, 6]
        },
        reflection: {
            enabled: true,
            required: false,
            constraints: {
                fixed: false
            },
            coords: [[2, -4], [2, 2]]
        },
        dilation: {
            enabled: true,
            required: false,
            constraints: {
                fixed: false
            },
            coord: [6, 6]
        }
    },
    drawSolutionShape: true,
    starting: {
        shape: {
            type: "polygon-3",
            coords: [[2, 2], [2, 6], [7, 2]],
        },
        transformations: []
    },
    correct: {
        shape: {
            type: "polygon-3",
            coords: [[2, 2], [2, 6], [7, 2]],
        },
        transformations: []
    }
};

function colorForTool(tool) {
    return tool.constraints.fixed ? KhanUtil.GRAY : KhanUtil.ORANGE;
}


/* Scales a distance from the default range of
 * [-10, 10] to a given props.range pair
 *
 * Used for sizing various transformation tools
 * (rotation handle, dilation circle)
 */
function scaleToRange(dist, range) {
    var spreadX = range[0][1] - range[0][0];
    var spreadY = range[1][1] - range[1][0];

    return dist * Math.max(spreadX, spreadY) / 20;
}

function dilatePointFromCenter(point, dilationCenter, scale) {
    var pv = KhanUtil.kvector.subtract(point, dilationCenter);
    var pvScaled = KhanUtil.kvector.scale(pv, scale);
    var transformedPoint = KhanUtil.kvector.add(dilationCenter, pvScaled);
    return transformedPoint;
}

function stringFromDecimal(number) {
    return String(KhanUtil.roundTo(9, number));
}

function stringFromFraction(number) {
    var frac = KhanUtil.toFraction(number, knumber.DEFAULT_TOLERANCE);
    if (frac[1] === 1) {
        return stringFromDecimal(number);
    } else {
        return stringFromDecimal(frac[0]) + "/" +
                stringFromDecimal(frac[1]);
    }
}

function texFromPoint(point) {
    return [
        TeX(null, "("),
        stringFromDecimal(point[0]),
        TeX(null, ", {}"),
        stringFromDecimal(point[1]),
        TeX(null, ")")
    ];
}

function texFromVector(vector) {
    return [
        TeX(null, "\\langle"),
        stringFromDecimal(vector[0]),
        TeX(null, ", {}"),
        stringFromDecimal(vector[1]),
        TeX(null, "\\rangle")
    ];
}

function texFromAngleDeg(angleDeg) {
    return stringFromDecimal(angleDeg) + DEGREE_SIGN;
}

function orderInsensitiveCoordsEqual(coords1, coords2) {
    coords1 = _.clone(coords1).sort(kpoint.compare);
    coords2 = _.clone(coords2).sort(kpoint.compare);
    return _.all(_.map(coords1, function(coord1, i) {
        var coord2 = coords2[i];
        return kpoint.equal(coord1, coord2);
    }));
}



/* Perform operations on raw transform objects */
var TransformOps = {
    apply: function(transform) {
        // Any transformation with empty text boxes is a no-op until
        // filled out (these show up as nulls in transform.vector/line/etc).
        // TODO (jack): Merge this just into reflections now that other
        // transforms are always valid (after merging transformation
        // collapsing, which may use isValid)
        if (!Transformations[transform.type].isValid(transform)) {
            return _.identity;  // do not transform the coord
        } else {
            return Transformations[transform.type].apply(transform);
        }
    },

    append: function(transformList, newTransform) {
        // Append newTransform to transformList, and collapse the last
        // two transforms if they are collapsable
        var results = TransformOps._appendAndCollapseLastTwo(
            transformList,
            newTransform
        );
        // Collapse any no-ops at the end of the transformation list
        return TransformOps._collapseFinalNoOps(results);
    },

    _collapseFinalNoOps: function(transforms) {
        // Collapse no-op transformations at the end of the list
        if (transforms.length && TransformOps.isNoOp(_.last(transforms))) {
            return _.initial(transforms);
        } else {
            return transforms;
        }
    },

    _appendAndCollapseLastTwo: function(transformList, newTransform) {
        if (!transformList.length) {
            return [newTransform];
        } else {
            var collapsed = TransformOps.collapse(
                _.last(transformList),
                newTransform
            );
            return _.initial(transformList).concat(collapsed);
        }
    },

    isNoOp: function(transform) {
        return Transformations[transform.type].isNoOp(transform);
    },

    collapse: function(transform1, transform2) {
        // We can only collapse transforms that have the same type
        if (transform1.type !== transform2.type) {
            return [transform1, transform2];
        }

        // Clicking the button again removes empty transformations
        if (TransformOps.isEmpty(transform1) &&
                TransformOps.isEmpty(transform2)) {
            return [];
        }

        // Don't collapse invalid transformations otherwise
        if (!TransformOps.isValid(transform1) ||
                !TransformOps.isValid(transform2)) {
            return [transform1, transform2];
        }

        return TransformOps._collapseValidMonotypedTransforms(
            transform1,
            transform2
        );
    },

    isValid: function(transform) {
        return Transformations[transform.type].isValid(transform);
    },

    isEmpty: function(transform) {
        return Transformations[transform.type].isEmpty(transform);
    },

    _collapseValidMonotypedTransforms: function(transform1, transform2) {
        var collapsed = Transformations[transform1.type].collapse(
            transform1,
            transform2
        );
        if (collapsed) {
            // Force all answers into an array
            if (!_.isArray(collapsed)) {
                collapsed = [collapsed];
            }
            // Add types to all transforms in the answer
            _.each(collapsed, function(transform) {
                transform.type = transform1.type;
            });
            return collapsed;
        } else {
            // These transforms can't be collapsed together
            return [transform1, transform2];
        }
    },

    toTeX: function(transform) {
        return Transformations[transform.type].toTeX(transform);
    },

    /* A react representation of this transform object */
    ListItem: React.createClass({displayName: 'ListItem',
        render: function() {
            if (this.props.mode === "dynamic") {
                return React.DOM.div(null, 
                    TransformOps.toTeX(this.props.transform)
                );
            } else if (this.props.mode === "interactive") {
                var transformClass =
                        Transformations[this.props.transform.type].Input;
                return transformClass(_.extend({
                    ref: "transform",
                    onChange: this.handleChange
                }, this.props.transform));
            } else {
                throw new Error("Invalid mode: " + this.props.mode);
            }
        },
        value: function() {
            if (this.props.mode === "interactive") {
                return _.extend({
                    type: this.props.transform.type,
                }, this.refs.transform.value());
            } else {
                return this.props.transform;
            }
        },
        handleChange: _.debounce(function() {
            this.props.onChange(this.value());
        }, RENDER_TRANSFORM_DELAY_IN_MS),
        focus: function() {
            this.refs.transform.focus();
        }
    })
};

var Transformations = {
    translation: {
        verbName: "Translate",
        nounName: "Translation",
        apply: function(transform) {
            return function(coord) {
                return KhanUtil.kvector.add(coord, transform.vector);
            };
        },
        isValid: function(transform) {
            return _.isFinite(transform.vector[0]) &&
                _.isFinite(transform.vector[1]);
        },
        isEmpty: function(transform) {
            return transform.vector[0] === null &&
                transform.vector[1] === null;
        },
        isNoOp: function(transform) {
            return kvector.equal(transform.vector, [0, 0]);
        },
        collapse: function(transform1, transform2) {
            return {
                vector: kvector.add(
                    transform1.vector,
                    transform2.vector
                )
            };
        },
        toTeX: function(transform) {
            return ["Translation by ", texFromVector(transform.vector)];
        },
        Input: React.createClass({displayName: 'Input',
            render: function() {
                return React.DOM.div(null, 
                    ' ',"Translation by",' ',
                    TeX(null, "\\langle"),
                    NumberInput(
                        {ref:"x",
                        placeholder:0,
                        value:this.props.vector[0],
                        onChange:this.props.onChange} ),
                    TeX(null, ", {}"),
                    NumberInput(
                        {ref:"y",
                        placeholder:0,
                        value:this.props.vector[1],
                        onChange:this.props.onChange} ),
                    TeX(null, "\\rangle")
                );
            },
            value: function() {
                var x = this.refs.x.getValue();
                var y = this.refs.y.getValue();
                return {
                    vector: [x, y]
                };
            },
            focus: function() {
                this.refs.x.focus();
            }
        })
    },

    rotation: {
        verbName: "Rotate",
        nounName: "Rotation",
        apply: function(transform) {
            return function(coord) {
                return KhanUtil.kpoint.rotateDeg(coord, transform.angleDeg,
                        transform.center);
            };
        },
        isValid: function(transform) {
            return _.isFinite(transform.angleDeg) &&
                _.isFinite(transform.center[0]) &&
                _.isFinite(transform.center[1]);
        },
        isEmpty: function(transform) {
            return transform.angleDeg === null &&
                transform.center[0] === null &&
                transform.center[1] === null;
        },
        isNoOp: function(transform) {
            return knumber.equal(transform.angleDeg, 0);
        },
        collapse: function(transform1, transform2) {
            if (!kpoint.equal(transform1.center, transform2.center)) {
                return false;
            }
            return {
                center: transform1.center,
                angleDeg: transform1.angleDeg + transform2.angleDeg
            };
        },
        toTeX: function(transform) {
            return [
                "Rotation by ",
                texFromAngleDeg(transform.angleDeg),
                " about ",
                texFromPoint(transform.center)
            ];
        },
        Input: React.createClass({displayName: 'Input',
            render: function() {
                return React.DOM.div(null, 
                    ' ',"Rotation about ", TeX(null, "("),
                    NumberInput(
                        {ref:"centerX",
                        placeholder:0,
                        value:this.props.center[0],
                        onChange:this.props.onChange} ),
                    TeX(null, ", {}"),
                    NumberInput(
                        {ref:"centerY",
                        placeholder:0,
                        value:this.props.center[1],
                        onChange:this.props.onChange} ),
                    TeX(null, ")"), " by",' ',
                    NumberInput(
                        {ref:"angleDeg",
                        placeholder:0,
                        value:this.props.angleDeg,
                        onChange:this.props.onChange} ),
                    DEGREE_SIGN
                );
            },
            value: function() {
                var angleDeg = this.refs.angleDeg.getValue();
                var centerX = this.refs.centerX.getValue();
                var centerY = this.refs.centerY.getValue();
                return {
                    angleDeg: angleDeg,
                    center: [centerX, centerY]
                };
            },
            focus: function() {
                this.refs.centerX.focus();
            }
        })
    },

    reflection: {
        verbName: "Reflect",
        nounName: "Reflection",
        apply: function(transform) {
            return function(coord) {
                return KhanUtil.kpoint.reflectOverLine(
                    coord,
                    transform.line
                );
            };
        },
        isValid: function(transform) {
            // A bit hacky, but we'll also define reflecting over a
            // single point as a no-op, to avoid NaN fun.
            return _.all(_.flatten(transform.line), _.isFinite) &&
                    !kpoint.equal(transform.line[0], transform.line[1]);
        },
        isEmpty: function(transform) {
            return _.all(_.flatten(transform.line), _.isNull);
        },
        isNoOp: function(transform) {
            // Invalid transforms are implicitly no-ops, so we don't
            // have to catch that case here.
            return false;
        },
        collapse: function(transform1, transform2) {
            if (!kline.equal(transform1.line, transform2.line)) {
                return false;
            }
            return [];
        },
        toTeX: function(transform) {
            var point1 = transform.line[0];
            var point2 = transform.line[1];
            return [
                "Reflection over the line from ",
                texFromPoint(point1),
                " to ",
                texFromPoint(point2)
            ];
        },
        Input: React.createClass({displayName: 'Input',
            render: function() {
                return React.DOM.div(null, 
                    ' ',"Reflection over the line from",' ',
                    TeX(null, "("),
                    NumberInput(
                        {ref:"x1",
                        allowEmpty:true,
                        value:this.props.line[0][0],
                        onChange:this.props.onChange} ),
                    TeX(null, ", {}"),
                    NumberInput(
                        {ref:"y1",
                        allowEmpty:true,
                        value:this.props.line[0][1],
                        onChange:this.props.onChange} ),
                    TeX(null, ")"), " to ", TeX(null, "("),
                    NumberInput(
                        {ref:"x2",
                        allowEmpty:true,
                        value:this.props.line[1][0],
                        onChange:this.props.onChange} ),
                    TeX(null, ", {}"),
                    NumberInput(
                        {ref:"y2",
                        allowEmpty:true,
                        value:this.props.line[1][1],
                        onChange:this.props.onChange} ),
                    TeX(null, ")")
                );
            },
            value: function() {
                var x1 = this.refs.x1.getValue();
                var y1 = this.refs.y1.getValue();
                var x2 = this.refs.x2.getValue();
                var y2 = this.refs.y2.getValue();
                return {
                    line: [[x1, y1], [x2, y2]]
                };
            },
            focus: function() {
                this.refs.x1.focus();
            }
        })
    },

    dilation: {
        verbName: "Dilate",
        nounName: "Dilation",
        apply: function(transform) {
            return function(coord) {
                return dilatePointFromCenter(coord, transform.center,
                        transform.scale);
            };
        },
        isValid: function(transform) {
            return _.isFinite(transform.scale) &&
                _.isFinite(transform.center[0]) &&
                _.isFinite(transform.center[1]);
        },
        isEmpty: function(transform) {
            return transform.scale === null &&
                transform.center[0] === null &&
                transform.center[1] === null;
        },
        isNoOp: function(transform) {
            return knumber.equal(transform.scale, 1);
        },
        collapse: function(transform1, transform2) {
            if (!kpoint.equal(transform1.center, transform2.center)) {
                return false;
            }
            return {
                center: transform1.center,
                scale: transform1.scale * transform2.scale
            };
        },
        toTeX: function(transform) {
            var scaleString = stringFromFraction(transform.scale);
            return [
                "Dilation of scale ",
                scaleString,
                " about ",
                texFromPoint(transform.center)
            ];
        },
        Input: React.createClass({displayName: 'Input',
            render: function() {
                return React.DOM.div(null, 
                    ' ',"Dilation about",' ',
                    TeX(null, "("),
                    NumberInput(
                        {ref:"x",
                        placeholder:0,
                        value:this.props.center[0],
                        onChange:this.props.onChange} ),
                    TeX(null, ", {}"),
                    NumberInput(
                        {ref:"y",
                        placeholder:0,
                        value:this.props.center[1],
                        onChange:this.props.onChange} ),
                    TeX(null, ")"), " by scale",' ',
                    NumberInput(
                        {ref:"scale",
                        placeholder:1,
                        value:this.props.scale,
                        onChange:this.props.onChange} )
                );
            },
            value: function() {
                var scale = this.refs.scale.getValue();
                var x = this.refs.x.getValue();
                var y = this.refs.y.getValue();
                return {
                    scale: scale,
                    center: [x, y]
                };
            },
            focus: function() {
                this.refs.x.focus();
            }
        })
    }
};


/* Various functions to deal with different shape types */
var ShapeTypes = {
    getPointCountForType: function(type) {
        var splitType = type.split("-");
        if (splitType[0] === "polygon") {
            return splitType[1] || 3;
        } else if (splitType[0] === "line" ||
                splitType[0] === "lineSegment") {
            return 2;
        } else if (splitType[0] === "angle") {
            return 3;
        } else if (splitType[0] === "circle") {
            return 2;
        } else if (splitType[0] === "point") {
            return 1;
        }
    },

    addMovableShape: function(graphie, options) {
        if (options.editable && options.translatable) {
            throw new Error("It doesn't make sense to have a movable shape " +
                    "where you can stretch the points and translate them " +
                    "simultaneously. options: " + JSON.stringify(options));
        }

        var shape;
        var points = _.map(options.shape.coords, function(coord) {
            var currentPoint;
            var isMoving = false;
            var previousCoord = coord;

            var onMove = function(x, y) {
                if (!isMoving) {
                    previousCoord = currentPoint.coord;
                    isMoving = true;
                }

                var moveVector = KhanUtil.kvector.subtract(
                    [x, y],
                    currentPoint.coord
                );

                // Translate from (x, y) semantics to (dX, dY) semantics
                // This is more useful for translations on multiple points,
                // where we care about how the points moved, not where any
                // individual point ended up
                if (options.onMove) {
                    moveVector = options.onMove(moveVector[0],
                            moveVector[1]);
                }

                // Perform a translation on all points in this shape when
                // any point moves
                if (options.translatable) {
                    _.each(points, function(point) {
                        // The point itself will be updated by the
                        // movablePoint class, so only translate the other
                        // points
                        if (point !== currentPoint) {
                            point.setCoord(KhanUtil.kvector.add(
                                point.coord,
                                moveVector
                            ));
                        }
                    });
                }

                // Update our shape and our currentPoint
                // Without this, some shapes (circles, angles) appear
                // "bouncy" as they are updated with currentPoint at the
                // current mouse coordinate (oldCoord), rather than newCoord
                var oldCoord = currentPoint.coord;
                var newCoord = KhanUtil.kvector.add(
                    currentPoint.coord,
                    moveVector
                );
                // Temporarily change our coordinate so that
                // shape.update() sees the new coordinate
                currentPoint.coord = newCoord;
                shape.update();
                // ...But don't break onMove, which assumes it
                // is the only thing changing our coord
                currentPoint.coord = oldCoord;
                return newCoord;
            };

            var onMoveEnd = function() {
                // onMove isn't guaranteed to be called before onMoveEnd, so
                // we have to take into account that we may not have moved and
                // set previousCoord.
                if (options.onMoveEnd && isMoving) {
                    isMoving = false;
                    // We don't use the supplied x and y parameters here
                    // because MovablePoint's onMoveEnd semantics suck.
                    // It returns the mouseX, mouseY without processing them
                    // through onMove, leaving us with weird fractional moves
                    var change = KhanUtil.kvector.subtract(
                        currentPoint.coord,
                        previousCoord
                    );
                    options.onMoveEnd(change[0], change[1]);
                }
                shape.update();
            };

            currentPoint = graphie.addMovablePoint({
                coord: coord,
                normalStyle: options.pointStyle,
                highlightStyle: options.pointStyle,
                constraints: {
                    fixed: !options.translatable && !options.editable
                },
                visible: options.showPoints,
                snapX: options.snap && options.snap[0] || 0,
                snapY: options.snap && options.snap[1] || 0,
                bounded: false, // Don't bound it when placing it on the graph
                onMove: onMove,
                onMoveEnd: onMoveEnd
            });

            // Bound it when moving
            // We can't set this earlier, because doing so would mean any
            // points outside of the graph would be moved into a moved into
            // a position that doesn't preserve the shape
            currentPoint.bounded = true;

            return currentPoint;
        });

        shape = ShapeTypes.addShape(graphie, options, points);
        var removeShapeWithoutPoints = shape.remove;
        shape.remove = function() {
            removeShapeWithoutPoints.apply(shape);
            _.invoke(points, "remove");
        };
        return shape;
    },

    addShape: function(graphie, options, points) {
        points = points || options.shape.coords;

        var types = ShapeTypes._typesOf(options.shape);
        var typeOptions = options.shape.options ||
                ShapeTypes.defaultOptions(types);

        var shapes = ShapeTypes._mapTypes(types, points,
                function(type, points, i) {
            var shapeOptions = _.extend({}, options, typeOptions[i]);
            return ShapeTypes._addType(graphie, type, points, shapeOptions);
        });

        var updateFuncs = _.filter(_.pluck(shapes, "update"), _.identity);
        var update = function() {
            _.invoke(updateFuncs, "call");
        };

        var removeFuncs = _.filter(_.pluck(shapes, "remove"), _.identity);
        var remove = function() {
            _.invoke(removeFuncs, "call");
        };

        var getOptions = function() {
            return _.map(shapes, function(shape) {
                if (shape.getOptions) {
                    return shape.getOptions();
                } else {
                    return {};
                }
            });
        };

        var toJSON = function() {
            var coords = _.map(points, function(pt) {
                if (_.isArray(pt)) {
                    return pt;
                } else {
                    return pt.coord;
                }
            });
            return {
                type: types,
                coords: coords,
                options: getOptions()
            };
        };

        return {
            type: types,
            points: points,
            update: update,
            remove: remove,
            toJSON: toJSON,
            getOptions: getOptions
        };
    },

    equal: function(shape1, shape2) {
        var types1 = ShapeTypes._typesOf(shape1);
        var types2 = ShapeTypes._typesOf(shape2);
        if (types1.length !== types2.length) {
            return false;
        }
        var shapes1 = ShapeTypes._mapTypes(types1, shape1.coords,
                ShapeTypes._combine);
        var shapes2 = ShapeTypes._mapTypes(types2, shape2.coords,
                ShapeTypes._combine);
        return _.all(_.map(shapes1, function(partialShape1, i) {
            var partialShape2 = shapes2[i];
            if (partialShape1.type !== partialShape2.type) {
                return false;
            }
            return ShapeTypes._forType(partialShape1.type).equal(
                partialShape1.coords,
                partialShape2.coords
            );
        }));
    },

    _typesOf: function(shape) {
        var types = shape.type;
        if (!_.isArray(types)) {
            types = [types];
        }
        return _.map(types, function(type) {
            if (type === "polygon") {
                return "polygon-3";
            } else {
                return type;
            }
        });
    },

    defaultOptions: function(types) {
        return _.map(types, function(type) {
            var typeDefaultOptions = ShapeTypes._forType(type).defaultOptions;
            return _.extend({}, typeDefaultOptions);
        });
    },

    _forType: function(type) {
        var baseType = type.split("-")[0];
        return ShapeTypes[baseType];
    },

    _mapTypes: function(types, points, func, context) {
        return _.map(types, function(type, i) {
            var pointCount = ShapeTypes.getPointCountForType(type);
            var currentPoints = _.first(points, pointCount);
            points = _.rest(points, pointCount);
            return func.call(context, type, currentPoints, i);
        });
    },

    _addType: function(graphie, type, points, options) {
        var lineCoords = _.isArray(points[0]) ? {
            coordA: points[0],
            coordZ: points[1],
        } : {
            pointA: points[0],
            pointZ: points[1],
        };

        type = type.split("-")[0];
        if (type === "polygon") {
            var polygon = graphie.addMovablePolygon(_.extend({}, options, {
                fixed: !options.editable,
                snapX: options.snap && options.snap[0] || 0,
                snapY: options.snap && options.snap[1] || 0,
                points: points,
                constrainToGraph: false
            }));
            return {
                update: _.bind(polygon.transform, polygon),
                remove: _.bind(polygon.remove, polygon)
            };
        } else if (type === "line" || type === "lineSegment") {
            var line = graphie.addMovableLineSegment(
                    _.extend({}, options, lineCoords, {
                movePointsWithLine: true,
                fixed: true,
                constraints: {
                    fixed: true
                },
                extendLine: (type === "line")
            }));

            // TODO(jack): Hide points on uneditable lines when translation
            // is a vector.
            // We can't just remove the points yet, because they are the
            // translation handle for the line.
            return {
                update: _.bind(line.transform, line, true),
                remove: _.bind(line.remove, line)
            };
        } else if (type === "angle") {
            // If this angle is editable, we want to be able to make angles
            // both larger and smaller than 180 degrees.
            // If this angle is not editable, it should always maintain
            // it's angle measure, even if it is reflected (causing the
            // clockwise-ness of the points to change)
            var shouldChangeReflexivity = options.editable ? null : false;

            var angle = graphie.addMovableAngle({
                angleLabel: "$deg0",
                fixed: true,
                points: points,
                normalStyle: options.normalStyle,
                reflex: options.reflex
            });

            // Hide non-vertex points on uneditable angles
            if (!_.isArray(points[0]) && !options.editable) {
                points[0].remove();
                points[2].remove();
            }
            return {
                update: _.bind(angle.update, angle, shouldChangeReflexivity),
                remove: _.bind(angle.remove, angle),
                getOptions: function() {
                    return {
                        reflex: angle.isReflex()
                    };
                }
            };
        } else if (type === "circle") {
            var perimeter = {
                // temporary object for the first removal
                remove: _.identity
            };
            var redrawPerim = function() {
                var coord0 = points[0].coord || points[0];
                var coord1 = points[1].coord || points[1];
                var radius = kpoint.distanceToPoint(coord0, coord1);
                perimeter.remove();
                perimeter = graphie.circle(coord0, radius, _.extend({
                    stroke: KhanUtil.BLUE,
                    "stroke-width": 2
                }, options.normalStyle));
            };

            redrawPerim();
            if (points[1].remove && !options.editable) {
                points[1].remove();
            }

            return {
                update: redrawPerim,
                remove: function() {
                    // Not _.bind because the remove function changes
                    // when the perimeter is redrawn
                    perimeter.remove();
                }
            };
        } else if (type === "point") {
            // do nothing
            return {
                update: null,
                remove: null
            };
        } else {
            throw new Error("Invalid shape type " + type);
        }
    },

    _combine: function(type, coords) {
        return {
            type: type,
            coords: coords
        };
    },

    polygon: {
        equal: orderInsensitiveCoordsEqual
    },

    line: {
        equal: kline.equal
    },

    lineSegment: {
        equal: orderInsensitiveCoordsEqual
    },

    angle: {
        equal: function(points1, points2) {
            if (!kpoint.equal(points1[1], points2[1])) {
                return false;
            }

            var line1_0 = [points1[1], points1[0]];
            var line1_2 = [points1[1], points1[2]];
            var line2_0 = [points2[1], points2[0]];
            var line2_2 = [points2[1], points2[2]];

            var equalUnflipped = kray.equal(line1_0, line2_0) &&
                    kray.equal(line1_2, line2_2);
            var equalFlipped = kray.equal(line1_0, line2_2) &&
                    kray.equal(line1_2, line2_0);

            return equalUnflipped || equalFlipped;
        },

        defaultOptions: {
            reflex: false
        }
    },

    circle: {
        equal: function(points1, points2) {
            var radius1 = kpoint.distanceToPoint(points1[0], points1[1]);
            var radius2 = kpoint.distanceToPoint(points2[0], points2[1]);
            return kpoint.equal(points1[0], points2[0]) &&
                knumber.equal(radius1, radius2);
        }
    },

    point: {
        equal: kpoint.equal
    }
};


var ToolSettings = React.createClass({displayName: 'ToolSettings',
    getDefaultProps: function() {
        return {
            allowFixed: true
        };
    },

    render: function() {
        return React.DOM.div(null, 
            this.props.name,":",' ',
            " ",
            PropCheckBox(
                {label:"enabled:",
                enabled:this.props.settings.enabled,
                onChange:this.props.onChange} ),
            " ",
            this.props.settings.enabled &&
                PropCheckBox(
                    {label:"required:",
                    required:this.props.settings.required,
                    onChange:this.props.onChange} ),
            
            this.props.settings.enabled &&
                InfoTip(null, 
                    "'Required' will only grade the answer as correct if the"+' '+
                    "student has used at least one such transformation."
                ),
            
            " ",
            this.props.allowFixed && this.props.settings.enabled &&
                PropCheckBox(
                    {label:"fixed:",
                    fixed:this.props.settings.constraints.fixed,
                    onChange:this.changeConstraints} ),
            
            this.props.allowFixed && this.props.settings.enabled &&
                InfoTip(null, 
                    "Enable 'fixed' to prevent the student from repositioning"+' '+
                    "the tool. The tool will appear in the position at which it"+' '+
                    "is placed in the editor below."
                )
            
        );
    },

    changeConstraints: function(changed) {
        var newConstraints = _.extend({}, this.props.constraints, changed);
        this.props.onChange({
            constraints: newConstraints
        });
    }
});


var TransformationExplorerSettings = React.createClass({displayName: 'TransformationExplorerSettings',
    render: function() {

        return React.DOM.div( {className:"transformer-settings"}, 
            React.DOM.div(null, 
                ' ',"Mode:",' ',
                React.DOM.select( {value:this.getMode(),
                        onChange:this.changeMode}, 
                    React.DOM.option( {value:"interactive,dynamic"}, 
                        ' ',"Exploration with text",' '
                    ),
                    React.DOM.option( {value:"interactive,static"}, 
                        ' ',"Exploration without text",' '
                    ),
                    React.DOM.option( {value:"dynamic,interactive"}, 
                        ' ',"Formal with movement",' '
                    ),
                    React.DOM.option( {value:"static,interactive"}, 
                        ' ',"Formal without movement",' '
                    )
                ),
                InfoTip(null, 
                    React.DOM.ul(null, 
                        React.DOM.li(null, 
                            React.DOM.b(null, "Exploration:"), " Students create"+' '+
                            "transformations with tools on the graph.",' '
                        ),
                        React.DOM.li(null, 
                            React.DOM.b(null, "Formal with movement:"), " Students specify"+' '+
                            "transformations mathematically in the"+' '+
                            "transformation list. Graph shows the results of"+' '+
                            "these transformations.",' '
                        ),
                        React.DOM.li(null, 
                            React.DOM.b(null, "Formal without movement:"), " Students specify"+' '+
                            "transformations mathematically in the"+' '+
                            "transformation list. Graph does not update.",' '
                        )
                    )
                )
            ),
            ToolSettings(
                    {name:"Translations",
                    settings:this.props.tools.translation,
                    allowFixed:false,
                    onChange:this.changeHandlerFor("translation")} ),
            ToolSettings(
                    {name:"Rotations",
                    settings:this.props.tools.rotation,
                    onChange:this.changeHandlerFor("rotation")} ),
            ToolSettings(
                    {name:"Reflections",
                    settings:this.props.tools.reflection,
                    onChange:this.changeHandlerFor("reflection")} ),
            ToolSettings(
                    {name:"Dilations",
                    settings:this.props.tools.dilation,
                    onChange:this.changeHandlerFor("dilation")} ),
            PropCheckBox(
                    {label:"Draw Solution:",
                    drawSolutionShape:this.props.drawSolutionShape,
                    onChange:this.props.onChange} )
        );
    },

    getMode: function() {
        return this.props.graphMode + "," + this.props.listMode;
    },

    changeMode: function(e) {
        var selected = e.target.value;
        var modes = selected.split(",");

        this.props.onChange({
            graphMode: modes[0],
            listMode: modes[1]
        });
    },

    changeHandlerFor: function(toolName) {
        return _.bind(function(change) {
            var newTools = _.clone(this.props.tools);
            newTools[toolName] = _.extend({}, this.props.tools[toolName],
                    change);

            this.props.onChange({
                tools: newTools
            });
        }, this);
    }
});


var TransformationsShapeEditor = React.createClass({displayName: 'TransformationsShapeEditor',
    render: function() {
        return React.DOM.div(null, 
            Graph(
                {ref:"graph",
                box:this.props.graph.box,
                range:this.props.graph.range,
                labels:this.props.graph.labels,
                step:this.props.graph.step,
                gridStep:this.props.graph.gridStep,
                markings:this.props.graph.markings,
                backgroundImage:this.props.graph.backgroundImage,
                onNewGraphie:this.setupGraphie} ),
            React.DOM.select(
                    {key:"type-select",
                    value:this.getTypeString(this.props.shape.type),
                    onChange:this.changeType} , 
                React.DOM.option( {value:"polygon-3"}, "Triangle"),
                React.DOM.option( {value:"polygon-4"}, "Quadrilateral"),
                React.DOM.option( {value:"polygon-5"}, "Pentagon"),
                React.DOM.option( {value:"polygon-6"}, "Hexagon"),
                React.DOM.option( {value:"line"}, "Line"),
                React.DOM.option( {value:"line,line"}, "2 lines"),
                React.DOM.option( {value:"lineSegment"}, "Line segment"),
                React.DOM.option( {value:"lineSegment,lineSegment"}, 
                    ' ',"2 line segments",' '
                ),
                React.DOM.option( {value:"angle"}, "Angle"),
                React.DOM.option( {value:"circle"}, "Circle")
            )
        );
    },

    /* Return the option string for a given type */
    getTypeString: function(type) {
        if (_.isArray(type)) {
            return _.map(type, this.getTypeString).join(",");
        } else if (type === "polygon") {
            return "polygon-" + this.props.shape.coords.length;
        } else {
            return type;
        }
    },

    /* Change the type on the window event e
     *
     * e.target.value is the new type string
     */
    changeType: function(e) {
        var types = String(e.target.value).split(",");
        var pointCount = arraySum(_.map(
                types,
                ShapeTypes.getPointCountForType
        ));

        var radius = scaleToRange(4, this.refs.graph.props.range);
        var offset = (1 / 2 - 1 / pointCount) * 180;
        var coords = _.times(pointCount, function(i) {
            return KhanUtil.kpoint.rotateDeg([radius, 0],
                360 * i / pointCount + offset);
        });

        this.props.onChange({
            shape: {
                type: types,
                coords: coords,
                options: ShapeTypes.defaultOptions(types)
            }
        });
    },

    componentDidUpdate: function(prevProps) {
        if (!deepEq(prevProps.shape, this.props.shape)) {
            this.refs.graph.reset();
        }
    },

    updateCoords: function() {
        this.props.onChange({
            shape: this.shape.toJSON()
        });
    },

    setupGraphie: function(graphie) {
        this.shape = ShapeTypes.addMovableShape(graphie, {
            editable: true,
            snap: graphie.snap,
            shape: this.props.shape,
            onMoveEnd: this.updateCoords
        });
    },

});

var TransformationListItem = TransformOps.ListItem;

var TransformationList = React.createClass({displayName: 'TransformationList',
    render: function() {
        if (this.props.mode === "static") {
            return React.DOM.span(null );  // don't render anything
        }

        this.transformationList = _.map(
            this.props.transformations,
            function(transform, i) {
                return TransformationListItem(
                            {ref:"transformation" + i,
                            key:"transformation" + i,
                            transform:transform,
                            mode:this.props.mode,
                            onChange:this.handleChange} );
            },
            this
        );

        return React.DOM.div( {className:"perseus-transformation-list"}, 
            this.transformationList
        );
    },

    value: function() {
        return _.times(this.props.transformations.length, function(i) {
            return this.refs["transformation" + i].value();
        }, this);
    },

    handleChange: function() {
        this.props.onChange(this.value());
    },

    focusLast: function() {
        if (this.transformationList.length) {
            _.last(this.transformationList).focus();
        }
    }
});

var ToolButton = React.createClass({displayName: 'ToolButton',
    render: function() {
        var classes = this.props.toggled ?
            "simple-button exercise-orange toggled highlighted-tool-button" :
            "simple-button";

        return React.DOM.button(
                {type:"button",
                className:classes,
                onClick:this.props.onClick}, 
            this.props.children
        );
    }
});

var ToolsBar = React.createClass({displayName: 'ToolsBar',
    getInitialState: function() {
        return {
            selected: null
        };
    },

    render: function() {
        var tools = _.map(Transformations, function(tool, type) {
            if (this.props.enabled[type]) {
                return ToolButton(
                        {key:type,
                        toggled:this.state.selected === type,
                        onClick:_.bind(this.changeSelected, this, type)}, 
                    tool.verbName
                );
            }
        }, this);

        return React.DOM.div( {className:"transformer-tools-bar"}, 
            React.DOM.span( {className:"simple-button-group"}, 
                tools
            ),
            React.DOM.button(
                    {className:"transformer-undo-button simple-button",
                    type:"button",
                    onClick:this.props.onUndoClick}, 
                React.DOM.span( {className:"icon-undo"} ),
                " ",
                ' ',"Undo",' '
            ),
            React.DOM.div( {className:"clear"})
        );
    },

    changeSelected: function(tool) {
        this.props.removeTool(this.state.selected);

        if (!tool || tool === this.state.selected) {
            this.setState({
                selected: null
            });
        } else {
            this.props.addTool(tool);
            this.setState({
                selected: tool
            });
        }
    }
});

var AddTransformBar = React.createClass({displayName: 'AddTransformBar',
    render: function() {
        var tools = _.map(Transformations, function(tool, type) {
            if (this.props.enabled[type]) {
                return ToolButton(
                        {key:type,
                        toggled:false,
                        onClick:_.bind(this.changeSelected, this, type)}, 
                    React.DOM.span( {className:"icon-plus"} ),
                    " ",
                    tool.nounName
                );
            }
        }, this);

        return React.DOM.div( {className:"transformer-tools-bar"}, 
            tools,
            React.DOM.button(
                    {className:"transformer-undo-button simple-button",
                    type:"button",
                    onClick:this.props.onUndoClick}, 
                React.DOM.span( {className:"icon-undo"} ),
                " ",
                ' ',"Undo",' '
            ),
            React.DOM.div( {className:"clear"})
        );
    },

    changeSelected: function(tool) {
        if (tool) {
            this.props.addTool(tool);
        }
    }
});

var Transformer = React.createClass({displayName: 'Transformer',
    // TODO (jack): These should be refactored into a nice object at the top
    // so that we don't have all this duplication
    getDefaultProps: function() {
        return _.defaults({
            graph: {},
            transformations: []
        }, defaultTransformerProps);
    },

    render: function() {
        // Fill in any missing value in this.props.graph
        // this can happen because the graph json doesn't include
        // box, for example
        var graph = _.extend(
                defaultGraphProps(this.props.graph, defaultBoxSize),
                this.props.graph
        );

        var interactiveToolsMode = this.props.graphMode === "interactive";

        var ToolsBarClass = interactiveToolsMode ?
                ToolsBar :
                AddTransformBar;

        // This style is applied inline because it is dependent on the
        // size of the graph as set by the graph.box prop, and this also
        // lets us specify it in the same place the graph's width is
        // specified.
        var toolsBar = React.DOM.div( {style:{width: graph.box[0]}}, 
            ToolsBarClass(
                {ref:"toolsBar",
                enabled:pluckObject(this.props.tools, "enabled"),
                addTool:this.addTool,
                removeTool:this.removeTool,
                onUndoClick:this.handleUndoClick} )
        );

        return React.DOM.div( {className:"perseus-widget " +
                        "perseus-widget-transformer"}, 
            Graph(
                {ref:"graph",
                box:graph.box,
                range:graph.range,
                labels:graph.labels,
                step:graph.step,
                gridStep:graph.gridStep,
                markings:graph.markings,
                backgroundImage:graph.backgroundImage,
                showProtractor:graph.showProtractor,
                onNewGraphie:this.setupGraphie} ),

            !interactiveToolsMode && (
                "Add transformations below:"
            ),

            this.props.graphMode === "static" && [
                React.DOM.br( {key:"static-br"} ),
                React.DOM.em( {key:"static-nomove"}, 
                    ' ',"Note: For this question, the shape will not move.",' '
                )
            ],

            interactiveToolsMode && toolsBar,

            TransformationList(
                {ref:"transformationList",
                mode:this.props.listMode,
                transformations:this.props.transformations,
                onChange:this.setTransformationProps} ),

            !interactiveToolsMode && toolsBar

        );
    },

    componentDidUpdate: function(prevProps) {
        if (this.shouldSetupGraphie(this.props, prevProps)) {
            this.refs.graph.reset();
        } else if (!deepEq(this.props.transformations,
                this.transformations)) {
            this.setTransformations(this.props.transformations);
        }
    },

    shouldSetupGraphie: function(nextProps, prevProps) {
        if (!deepEq(prevProps.starting, nextProps.starting)) {
            return true;
        } else if (prevProps.graphMode !== nextProps.graphMode) {
            return true;
        } else if (prevProps.listMode !== nextProps.listMode) {
            return true;
        } else if (prevProps.drawSolutionShape !==
                nextProps.drawSolutionShape) {
            return true;
        } else if (nextProps.drawSolutionShape && !deepEq(
                prevProps.correct.shape, nextProps.correct.shape)) {
            return true;
        } else if (!deepEq(this.tools, nextProps.tools)) {
            return true;
        } else {
            return false;
        }
    },

    graphie: function() {
        return this.refs.graph.graphie();
    },

    setupGraphie: function() {
        var self = this;

        var graphie = this.graphie();

        // A background image of our solution:
        if (this.props.drawSolutionShape &&
                this.props.correct.shape &&
                this.props.correct.shape.coords) {
            ShapeTypes.addShape(graphie, {
                fixed: true,
                shape: self.props.correct.shape,
                normalStyle: {
                    stroke: KhanUtil.GRAY,
                    "stroke-dasharray": "",
                    "stroke-width": 2
                }
            });
        }

        this.currentTool = null;
        this.refs.toolsBar.changeSelected(null);
        this.addTransformerShape(this.props.starting.shape,
                /* translatable */ false);
        this.setTransformations(this.props.transformations);

        // Save a copy of our tools so that we can check future
        // this.props.tools changes against them
        // This seems weird, but gives us an easy way to tell whether
        // props changes were self-inflicted (for which a graphie reset
        // is not required, and is in fact a bad idea right now because
        // of resetting the size of the dilation tool).
        // TODO (jack): A deepClone method would be nice here
        this.tools = {
            translation: _.clone(this.props.tools.translation),
            rotation: _.clone(this.props.tools.rotation),
            reflection: _.clone(this.props.tools.reflection),
            dilation: _.clone(this.props.tools.dilation)
        };
    },

    /* Applies all transformations in `transformations`
     * to the starting shape, and updates this.transformations
     * to reflect this
     *
     * Usually called with this.props.transformations
     */
    setTransformations: function(transformations) {
        this.resetCoords();
        this.transformations = _.clone(transformations);
        _.each(this.transformations, this.applyTransform);
    },

    // the polygon that we transform
    addTransformerShape: function(shape, translatable) {
        var self = this;
        var graphie = this.graphie();

        this.shape = ShapeTypes.addMovableShape(graphie, {
            shape: shape,
            editable: false,
            showPoints: (this.props.graphMode !== "static"),
            translatable: translatable,
            onMove: function (dX, dY) {
                dX = KhanUtil.roundToNearest(graphie.snap[0], dX);
                dY = KhanUtil.roundToNearest(graphie.snap[1], dY);
                self.addTransform({
                    type: "translation",
                    vector: [dX, dY]
                });
                return [dX, dY];
            },
            pointStyle: {
                fill: (translatable ? KhanUtil.ORANGE : KhanUtil.BLUE),
                stroke: (translatable ? KhanUtil.ORANGE : KhanUtil.BLUE)
            }
        });
    },

    addTool: function(toolId) {
        var self = this;

        if (this.props.graphMode === "interactive") {
            if (toolId === "translation") {
                this.currentTool = this.addTranslationTool();
            } else if (toolId === "rotation") {
                this.currentTool = this.addRotationTool();
            } else if (toolId === "reflection") {
                this.currentTool = this.addReflectionTool();
            } else if (toolId === "dilation") {
                this.currentTool = this.addDilationTool();
            } else {
                throw new Error("Invalid tool id: " + toolId);
            }
        } else {
            var transform;
            if (toolId === "translation") {
                transform = {
                    type: toolId,
                    vector: [null, null]
                };
            } else if (toolId === "rotation") {
                transform = {
                    type: toolId,
                    center: [null, null],
                    angleDeg: null
                };
            } else if (toolId === "reflection") {
                // Reflections with nulls in them won't be applied until
                // fills in the blanks
                transform = {
                    type: toolId,
                    line: [[null, null], [null, null]]
                };
            } else if (toolId === "dilation") {
                transform = {
                    type: toolId,
                    center: [null, null],
                    scale: null
                };
            } else {
                throw new Error("Invalid tool id: " + toolId);
            }

            this.doTransform(transform, function() {
                self.refs.transformationList.focusLast();
            });
        }
    },

    removeTool: function(toolId) {
        if (this.currentTool) {
            this.currentTool.remove();
        }
        this.currentTool = null;
    },

    addTranslationTool: function() {
        var self = this;
        this.shape.remove();
        this.addTransformerShape(this.shape.toJSON(),
                /* translatable */ true);

        return {
            remove: function() {
                self.shape.remove();
                self.addTransformerShape(self.shape.toJSON(),
                        /* translatable */ false);
            }
        };
    },

    // Snaps a coord to this.graphie()'s snap
    snapCoord: function(coord) {
        var graphie = this.graphie();
        return _.map(coord, function (val, dim) {
            return KhanUtil.roundToNearest(graphie.snap[dim], val);
        });
    },

    // Normalize the coords into something that fits the new 45 degree
    // reflection line.
    normalizeReflectionCoords: function(messyCoords) {
        var midpoint = this.snapCoord(kline.midpoint(messyCoords));
        var origDirectionPolar = kvector.polarDegFromCart(
            kvector.subtract(messyCoords[0], messyCoords[1])
        );
        var directionPolar = [
            1,
            KhanUtil.roundToNearest(45, origDirectionPolar[1])
        ];
        var direction = kvector.cartFromPolarDeg(directionPolar);
        var coords = _.map([-1, 1], function(directionCoefficient) {
            var coord = kvector.add(
                midpoint,
                kvector.scale(
                    direction,
                    directionCoefficient *
                        this.scaleToCurrentRange(REFLECT_ROTATE_HANDLE_DIST)
                )
            );
            return this.snapCoord(coord);
        }, this);
        return coords;
    },

    addReflectionTool: function() {
        var options = this.props.tools.reflection;
        if (!options.enabled) {
            return;
        }
        var self = this;
        var graphie = this.refs.graph.graphie();

        var updateReflectionTool = function() {
            self.changeTool("reflection", {
                coords: _.pluck(reflectPoints, "coord")
            });
        };

        var coords = this.normalizeReflectionCoords(options.coords);

        // The points defining the line of reflection; hidden from the
        // user.
        var reflectPoints = _.map(coords, function(coord) {
            return graphie.addMovablePoint({
                coord: coord,
                visible: false
            });
        }, this);

        // the line of reflection
        // TODO(jack): graphie.style here is a hack to prevent the dashed
        // style from leaking into the rest of the shapes. Remove when
        // graphie.addMovableLineSegment doesn't leak styles anymore.
        var reflectLine;
        graphie.style({}, function() {
            reflectLine = graphie.addMovableLineSegment({
                fixed: options.constraints.fixed,
                constraints: options.constraints,
                pointA: reflectPoints[0],
                pointZ: reflectPoints[1],
                snapX: graphie.snap[0],
                snapY: graphie.snap[1],
                extendLine: true,
                normalStyle: {
                    "stroke": (options.constraints.fixed ?
                            KhanUtil.GRAY :
                            KhanUtil.ORANGE
                    ),
                    "stroke-width": 2,
                    "stroke-dasharray": "- "
                },
                highlightStyle: {
                    "stroke": KhanUtil.ORANGE,
                    "stroke-width": 2,
                    "stroke-dasharray": "- " // TODO(jack) solid doesn't
                                             // work here, but would be
                                             // nicer
                },
                movePointsWithLine: true,
                onMoveEnd: updateReflectionTool
            });
        });

        // the "button" point in the center of the line of reflection
        var reflectButton = graphie.addReflectButton({
            fixed: options.constraints.fixed,
            line: reflectLine,
            size: this.scaleToCurrentRange(REFLECT_BUTTON_SIZE),
            onClick: function() {
                self.doTransform({
                    type: "reflection",
                    line: _.pluck(reflectPoints, "coord")
                });
                if (reflectRotateHandle) {
                    // flip the rotation handle
                    reflectRotateHandle.setCoord(kvector.add(
                        reflectButton.coord,
                        kvector.subtract(
                            reflectButton.coord,
                            reflectRotateHandle.coord
                        )
                    ));
                    reflectRotateHandle.update();
                }
            },
            normalStyle: {
                stroke: KhanUtil.ORANGE,
                "stroke-width": 2,
                fill: KhanUtil.ORANGE
            },
            highlightStyle: {
                stroke: KhanUtil.ORANGE,
                "stroke-width": 3,
                fill: KhanUtil.ORANGE
            },
            onMoveEnd: updateReflectionTool
        });

        var reflectRotateHandle = null;
        if (!options.constraints.fixed) {
            // The rotation handle for rotating the line of reflection
            var initRotateHandleAngle = kvector.polarDegFromCart(
                kvector.subtract(
                    reflectPoints[1].coord,
                    reflectPoints[0].coord
                )
            )[1] + 90; // 90 degrees off of the line
            reflectRotateHandle = graphie.addRotateHandle({
                center: reflectButton,
                radius: this.scaleToCurrentRange(REFLECT_ROTATE_HANDLE_DIST),
                angleDeg: initRotateHandleAngle,
                width: this.scaleToCurrentRange(0.24),
                hoverWidth: this.scaleToCurrentRange(0.4),
                lengthAngle: 17,
                onMove: function(newAngle) {
                    return KhanUtil.roundToNearest(45, newAngle);
                },
                onMoveEnd: updateReflectionTool
            });
        }

        // Move the reflectButton and reflectRotateHandle with the line
        $(reflectLine).on("move",
                function() {
            reflectButton.update();
            $(reflectButton).trigger("move"); // update the rotation handle,
                    // which watches for this in ke/utils/interactive.js.
        });

        // Update the line and reflect button when the reflectRotateHandle is
        // rotated
        if (reflectRotateHandle) {
            $(reflectRotateHandle).on("move", function() {
                var rotateHandleApprox = self.snapCoord(
                    reflectRotateHandle.coord
                );

                var rotateVector = kvector.subtract(
                    rotateHandleApprox,
                    reflectButton.coord
                );

                var flipped = reflectButton.isFlipped() ? 1 : 0;
                reflectPoints[flipped].setCoord(kvector.add(
                    reflectButton.coord,
                    kvector.rotateDeg(rotateVector, 90)
                ));
                reflectPoints[1 - flipped].setCoord(kvector.add(
                    reflectButton.coord,
                    kvector.rotateDeg(rotateVector, -90)
                ));

                reflectLine.transform(true);
                reflectButton.update();
            });
        }

        return {
            remove: function() {
                reflectButton.remove();
                if (reflectRotateHandle) {
                    reflectRotateHandle.remove();
                }
                reflectLine.remove();
                reflectPoints[0].remove();
                reflectPoints[1].remove();
            }
        };
    },

    /* Scales a distance from the default range of
     * [-10, 10] to the current this.props.graph.range
     *
     * Used for sizing various transformation tools
     * (rotation handle, dilation circle)
     */
    scaleToCurrentRange: function(dist) {
        return scaleToRange(dist, this.refs.graph.props.range);
    },

    addRotationTool: function() {
        var options = this.props.tools.rotation;
        if (!options.enabled) {
            return;
        }
        var self = this;
        var graphie = this.refs.graph.graphie();

        var pointColor = colorForTool(options);
        // The center of our rotation, which can be moved to change the
        // center of rotation
        this.rotatePoint = graphie.addMovablePoint({
            constraints: options.constraints,
            coord: options.coord,
            snapX: graphie.snap[0],
            snapY: graphie.snap[1],
            normalStyle: {               // ugh, this seems to be a global and
                "stroke-dasharray": "",  // is set to dash above
                stroke: pointColor,
                fill: pointColor
            },
            highlightStyle: {
                "stroke-dasharray": "",
                stroke: pointColor,
                fill: pointColor
            }
        });

        // The point that we move around the center of rotation to actually
        // cause rotations
        this.rotateHandle = graphie.addRotateHandle({
            center: this.rotatePoint,
            radius: this.scaleToCurrentRange(ROTATE_HANDLE_DIST),
            width: this.scaleToCurrentRange(0.24),
            hoverWidth: this.scaleToCurrentRange(0.4),
            onMove: function(newAngle, oldAngle) {
                var transform = self.getRotationTransformFromAngle(
                    self.rotatePoint.coord,
                    newAngle - oldAngle
                );

                // Rotate polygon with rotateHandle
                self.doTransform(transform);

                return oldAngle + transform.angleDeg;
            }
        });

        // Update tools.rotation.coord
        this.rotatePoint.onMoveEnd = function(x, y) {
            self.changeTool("rotation", {
                coord: [x, y]
            });
        };


        return {
            remove: function() {
                self.rotateHandle.remove();
                self.rotatePoint.remove();
            }
        };
    },

    addDilationTool: function() {
        var options = this.props.tools.dilation;
        if (!options.enabled) {
            return;
        }
        var self = this;
        var graphie = this.refs.graph.graphie();

        var pointColor = colorForTool(options);
        // the circle for causing dilation transforms
        self.dilationCircle = graphie.addCircleGraph({
            centerConstraints: options.constraints,
            center: options.coord,
            radius: self.scaleToCurrentRange(2),
            snapX: graphie.snap[0],
            snapY: graphie.snap[1],
            minRadius: self.scaleToCurrentRange(1),
            snapRadius: self.scaleToCurrentRange(0.5),
            onResize: function(newRadius, oldRadius) {
                self.doTransform({
                    type: "dilation",
                    center: self.dilationCircle.centerPoint.coord,
                    scale: newRadius/oldRadius
                });
            },
            circleNormalStyle: {
                "stroke": KhanUtil.ORANGE,
                "stroke-width": 2,
                "stroke-dasharray": "- ",
                "fill-opacity": 0
            },
            circleHighlightStyle: {
                "stroke": KhanUtil.ORANGE,
                "stroke-width": 2,
                "stroke-dasharray": "",
                "fill": KhanUtil.ORANGE,
                "fill-opacity": 0.05
            },
            centerNormalStyle: {
                "stroke": pointColor,
                "fill": pointColor,
                "stroke-width": 2,
                "stroke-dasharray": ""
            },
            centerHighlightStyle: {
                "stroke": pointColor,
                "fill": pointColor,
                "stroke-width": 2,
                "stroke-dasharray": ""
            }
        });

        var origOnMoveEnd = this.dilationCircle.centerPoint.onMoveEnd;
        this.dilationCircle.centerPoint.onMoveEnd = function() {
            if (origOnMoveEnd) {
                origOnMoveEnd.apply(this, _.toArray(arguments));
            }
            self.changeTool("dilation", {
                coord: self.dilationCircle.centerPoint.coord
            });
        };

        return {
            remove: function() {
                self.dilationCircle.remove();
            }
        };
    },

    // returns a transformation object representing a rotation
    // rounds the angle to the nearest 15 degrees
    getRotationTransformFromAngle: function(center, angleChanged) {
        angleChanged = (angleChanged + 360) % 360;
        if (angleChanged > 180) {
            angleChanged -= 360;
        }
        var roundedAngle = Math.round(
                angleChanged / ROTATE_SNAP_DEGREES
            ) * ROTATE_SNAP_DEGREES;

        return {
            type: "rotation",
            center: center,
            angleDeg: roundedAngle
        };
    },

    // apply and save a transform
    doTransform: function(transform, callback) {
        this.applyTransform(transform);
        this.addTransform(transform, callback);
    },

    // apply a transform to our polygon (without modifying our transformation
    // list)
    applyTransform: function(transform) {
        if (this.props.graphMode !== "static") {
            var transformFunc = TransformOps.apply(transform);
            this.applyCoordTransformation(transformFunc);
        }
    },

    // transform our polygon by transforming each point using a given function
    applyCoordTransformation: function(pointTransform) {
        _.each(this.shape.points, function(point) {
            var newCoord = pointTransform(point.coord);
            point.setCoord(newCoord);
        });
        this.shape.update();
    },

    resetCoords: function() {
        var startCoords = this.props.starting.shape.coords;
        _.each(this.shape.points, function(point, i) {
            point.setCoord(startCoords[i]);
        });
        this.shape.update();
    },

    // Remove the last transfromation
    handleUndoClick: function() {
        this.refs.toolsBar.changeSelected(null);
        if (this.props.transformations.length) {
            this.props.onChange({
                transformations: _.initial(this.props.transformations)
            });
        }
    },

    setTransformationProps: function(newTransfomationList) {
        this.props.onChange({
            transformations: newTransfomationList
        });
    },

    // add a transformation to our props list of transformation
    addTransform: function(transform, callback) {
        this.transformations = TransformOps.append(
                this.transformations,
                transform
        );
        this.props.onChange({
            transformations: _.clone(this.transformations)
        }, callback);
    },

    changeTool: function(tool, changes) {
        var newTools = _.clone(this.props.tools);
        newTools[tool] = _.extend({}, this.props.tools[tool], changes);
        this.tools[tool] = _.clone(newTools[tool]);
        this.props.onChange({
            tools: newTools,
        });
    },

    simpleValidate: function(rubric) {
        return Transformer.validate(this.toJSON(), rubric);
    },

    /**
     * Calculate where the coordinates would be if they were
     * moved, even if we're in formal mode with no movement
     * (and thus the actual movablepoints may not have moved
     */
    getCoords: function() {
        var startCoords = this.props.starting.shape.coords;
        var transforms = this.props.transformations;
        return _.reduce(transforms, function (coords, transform) {
            return _.map(coords, TransformOps.apply(transform));
        }, startCoords);
    },

    toJSON: function() {
        var json = _.pick(this.props, "grading", "starting", "graphMode",
                "listMode", "tools", "drawSolutionShape", "gradeEmpty");
        json.graph = this.refs.graph.toJSON();
        json.answer = {
            transformations: this.props.transformations,
            // This doesn't call this.shape.toJSON() because that doesn't
            // handle coordinates in formal mode without movement, since
            // the movablepoints never move
            shape: {
                type: this.shape.type,
                coords: this.getCoords(),
                options: this.shape.getOptions()
            }
        };
        json.version = 1.2; // Give us some safety to change the format
                            // when we realize that I wrote
                            // a horrible json spec for this widget
        return json;
    }
});

_.extend(Transformer, {
    validate: function (guess, rubric) {
        // Check for any required transformations
        for (var type in Transformations) {
            if (rubric.tools[type].required) {
                var isUsed = _.any(_.map(guess.answer.transformations,
                        function(transform) {
                    // Required transformations must appear in the
                    // transformation list, and must not be no-ops
                    return (transform.type === type) &&
                        !TransformOps.isEmpty(transform) &&
                        !TransformOps.isNoOp(transform);
                }));

                if (!isUsed) {
                    return {
                        type: "invalid",
                        message: "Your transformation must use a " + type + "."
                    };
                }
            }
        }

        // Compare shapes
        if (ShapeTypes.equal(guess.answer.shape,
                rubric.correct.shape)) {
            return {
                type: "points",
                earned: 1,
                total: 1,
                message: null
            };
        } else if (!rubric.gradeEmpty && deepEq(
                    guess.answer.shape.coords,
                    rubric.starting.shape.coords
                )) {
            return {
                type: "invalid",
                message: "Use the interactive graph to define a correct " +
                    "transformation."
            };
        } else {
            return {
                type: "points",
                earned: 0,
                total: 1,
                message: null
            };
        }
    }
});

var TransformerEditor = React.createClass({displayName: 'TransformerEditor',
    // TODO (jack): These should be refactored into a nice object at the top
    // so that we don't have all this duplication
    getDefaultProps: function() {
        return _.defaults({
            graph: defaultGraphProps(this.props.graph, 340)
        }, defaultTransformerProps);
    },

    render: function() {
        // Fill in any missing value in this.props.graph
        // this can happen because the graph json doesn't include
        // box, for example
        var graph = _.extend(
                defaultGraphProps(this.props.graph, 340),
                this.props.graph
        );

        return React.DOM.div(null, 
            React.DOM.div(null, 
                PropCheckBox(
                    {label:"Grade empty answers as wrong:",
                    gradeEmpty:this.props.gradeEmpty,
                    onChange:this.props.onChange} ),
                InfoTip(null, 
                    React.DOM.p(null, 
                        "We generally don't grade empty answers. This usually"+' '+
                        "works well, but sometimes can result in giving away"+' '+
                        "part of an answer in a multi-part question."
                    ),
                    React.DOM.p(null, 
                        "If this is a multi-part question (there is another"+' '+
                        "widget), you probably want to enable this option."+' '+
                        "Otherwise, you should leave it disabled."
                    ),
                    React.DOM.p(null, 
                        "Confused? Talk to Elizabeth."
                    )
                )
            ),
            React.DOM.div(null, "Graph settings:"),
            GraphSettings(
                {box:graph.box,
                labels:graph.labels,
                range:graph.range,
                step:graph.step,
                gridStep:graph.gridStep,
                valid:graph.valid,
                backgroundImage:graph.backgroundImage,
                markings:graph.markings,
                showProtractor:graph.showProtractor,
                onChange:this.changeGraph} ),
            React.DOM.div(null, "Transformation settings:"),
            TransformationExplorerSettings(
                {ref:"transformationSettings",
                graphMode:this.props.graphMode,
                listMode:this.props.listMode,
                tools:this.props.tools,
                drawSolutionShape:this.props.drawSolutionShape,
                onChange:this.props.onChange} ),
            React.DOM.div(null, "Starting location:"),
            TransformationsShapeEditor(
                {ref:"shapeEditor",
                graph:graph,
                shape:this.props.starting.shape,
                onChange:this.changeStarting} ),
            React.DOM.div(null, "Solution transformations:"),
            Transformer(
                {ref:"explorer",
                graph:graph,
                graphMode:this.props.graphMode,
                listMode:this.props.listMode,
                gradeEmpty:this.props.gradeEmpty,
                tools:this.props.tools,
                drawSolutionShape:this.props.drawSolutionShape,
                starting:this.props.starting,
                correct:this.props.starting,
                transformations:this.props.correct.transformations,
                onChange:this.changeTransformer} )
        );
    },

    // propagate a props change on our graph settings to
    // this.props.graph
    changeGraph: function(graphChanges, callback) {
        var newGraph = _.extend({}, this.props.graph, graphChanges);
        this.props.onChange({
            graph: newGraph
        }, callback);
    },

    // propagate a props change on our starting graph to
    // this.props.starting
    changeStarting: function(startingChanges) {
        var newStarting = _.extend({}, this.props.starting, startingChanges);
        this.props.onChange({
            starting: newStarting
        });
    },

    // propagate a transformations change onto correct.transformations
    changeTransformer: function(changes, callback) {
        if (changes.transformations) {
            changes.correct = {
                transformations: changes.transformations
            };
            delete changes.transformations;
        }
        this.props.onChange(changes, callback);
    },

    toJSON: function() {
        var json = this.refs.explorer.toJSON();
        json.correct = json.answer;
        delete json.answer;
        return json;
    }
});


Widgets.register("transformer", Transformer);
Widgets.register("transformer-editor", TransformerEditor);

})(Perseus);

},{"../components/graph-settings.jsx":6,"../components/graph.jsx":7,"../components/info-tip.jsx":8,"../components/number-input.jsx":9,"../components/prop-check-box.jsx":10,"../core.js":15,"../tex.jsx":37,"../util.js":38,"../widgets.js":39}]},{},[21])
;