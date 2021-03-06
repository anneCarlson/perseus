/** @jsx React.DOM */

require("../core.js");
var Util = require("../util.js");
var Widgets = require("../widgets.js");

var JsonifyProps = require("../mixins/jsonify-props.jsx");
var Changeable = require("../mixins/changeable.jsx");

var InfoTip = require("../components/info-tip.jsx");
var PropCheckBox = require("../components/prop-check-box.jsx");
var NumberInput = require("../components/number-input.jsx");
var ButtonGroup = require("../components/button-group.jsx");
var MultiButtonGroup = require("../components/multi-button-group.jsx");

var numericParse = Util.firstNumericalParse;

var answerFormButtons = [
    {title: "Integers", value: "integer", text: "6"},
    {title: "Decimals", value: "decimal", text: "0.75"},
    {title: "Proper fractions", value: "proper", text: "\u2157"},
    {title: "Improper fractions", value: "improper",
        text: "\u2077\u2044\u2084"},
    {title: "Mixed numbers", value: "mixed", text: "1\u00BE"},
    {title: "Numbers with \u03C0", value: "pi", text: "\u03C0"}
];

var formExamples = {
    "integer": (options) => $._("an integer, like $6$"),
    "proper": (options) => options.simplify === "optional" ?
        $._("a *proper* fraction, like $1/2$ or $6/10$") :
        $._("a *simplified proper* fraction, like $3/5$"),
    "improper": (options) => options.simplify === "optional" ?
        $._("an *improper* fraction, like $10/7$ or $14/8$") :
        $._("a *simplified improper* fraction, like $7/4$"),
    "mixed": () => $._("a mixed number, like $1\\ 3/4$"),
    "decimal": () => $._("an *exact* decimal, like $0.75$"),
    "pi": () => $._("a multiple of pi, like $12\\ \\text{pi}$ or " +
                "$2/3\\ \\text{pi}$")
};

var NumericInput = React.createClass({
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
        return <input type="text"
                    value={this.props.currentValue}
                    onChange={this.handleChange}
                    className={"perseus-input-size-" + this.props.size} />;
    },

    handleChange: function(e) {
        this.props.onChange({ currentValue: e.target.value });
    },

    focus: function() {
        this.getDOMNode().focus();
        return true;
    },

    toJSON: function(skipValidation) {
        return {currentValue: this.props.currentValue};
    },

    simpleValidate: function(rubric) {
        return NumericInput.validate(this.toJSON(), rubric);
    },

    examples: function() {
        return _.map(this.props.answerForms, function(form) {
            return formExamples[form](this.props);
        }, this);
    },

    statics: {
        displayMode: "inline-block"
    }
});

_.extend(NumericInput, {
    validate: function(state, rubric) {
        var allAnswerForms = _.pluck(answerFormButtons, "value");

        var createValidator = (answer) =>
            Khan.answerTypes.number.createValidatorFunctional(
                answer.value, {
                    message: answer.message,
                    simplify: answer.status === "correct" ?
                        answer.simplify : "optional",
                    inexact: true, // TODO(merlob) backfill / delete
                    maxError: answer.maxError,
                    forms: answer.strict ? answer.answerForms : allAnswerForms
            });

        // Look through all correct answers for one that matches either
        // precisely or approximately and return the appropriate message:
        // - if precise, return the message that the answer came with
        // - if it needs to be simplified, etc., show that message
        var correctAnswers = _.where(rubric.answers, {status: "correct"});
        var result = _.find(_.map(correctAnswers, (answer) => {
            var validate = createValidator(answer);
            return validate(state.currentValue);
        }), match => match.correct || match.empty);

        if (!result) { // Otherwise, if the guess is not correct
            var otherAnswers = ([]).concat(
                _.where(rubric.answers, {status: "ungraded"}),
                _.where(rubric.answers, {status: "wrong"})
            );

            // Look through all other answers and if one matches either
            // precisely or approximately return the answer's message
            match = _.find(otherAnswers, (answer) => {
                 var validate = createValidator(answer);
                 return validate(state.currentValue).correct;
             });
            result = {
                empty: match ? match.status === "ungraded" : false,
                correct: match ? match.status === "correct" : false,
                message: match ? match.message : null,
                guess: state.currentValue
            };
        }

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

var initAnswer = (status) => {
    return {
        value: null,
        status: status,
        message: "",
        simplify: "required",
        answerForms: [],
        strict: false,
        maxError: null
    };
};

var NumericInputEditor = React.createClass({
    mixins: [JsonifyProps, Changeable],

    getDefaultProps: function() {
        return {
            answers: [initAnswer("correct")],
            size: "normal"
        };
    },

    getInitialState: function() {
        return {
            answers: this.props.answers,
            showOptions: _.map(this.props.answers, () => false)
        };
    },

    render: function() {
        var answers = this.state.answers;

        var unsimplifiedAnswers = (i) => <div className="perseus-widget-row">
            <label>Unsimplified answers are</label>
            <ButtonGroup value={answers[i]["simplify"]}
                         allowEmpty={false}
                         buttons={[
                            {value: "required", text: "ungraded"},
                            {value: "optional", text: "accepted"},
                            {value: "enforced", text: "wrong"}]}
                         onChange={this.updateAnswer(i, "simplify")} />
            <InfoTip>
                <p>Normally select "ungraded". This will give the
                user a message saying the answer is correct but not
                simplified. The user will then have to simplify it and
                re-enter, but will not be penalized. (5th grade and after)</p>
                <p>Select "accepted" only if the user is not
                expected to know how to simplify fractions yet. (Anything
                prior to 5th grade)</p>
                <p>Select "wrong" <em>only</em> if we are
                specifically assessing the ability to simplify.</p>
            </InfoTip>
        </div>;

        var suggestedAnswerTypes = (i) => <div>
            <div className="perseus-widget-row">
                <label>Choose the suggested answer formats</label>
                <MultiButtonGroup buttons={answerFormButtons}
                    values={answers[i]["answerForms"]}
                    onChange={this.updateAnswer(i, "answerForms")} />
                <InfoTip>
                    <p>By default, nothing is selected. Only select an option
                    if you want to show a suggested answer format, or restrict
                    the answer to a specific format.</p>
                    {/* TODO(merlob) <p>Values with &pi; will autoselect the
                        "&pi;" type for you</p> */}
                    <p>Unless you are testing that specific skill, please
                    do not restrict the answer format.</p>
                    <p>To restrict the answer to <em>only</em> an improper
                        fraction (i.e. 7/4), select the
                        improper fraction and toggle "strict" to true.
                        This <b>will not</b> accept 1.75 as an answer. </p>
                </InfoTip>
            </div>
            <div className="perseus-widget-row">
                <PropCheckBox label="Strictly match only these formats"
                    strict={answers[i]["strict"]}
                    onChange={this.updateAnswer.bind(this, i)} />
            </div>
        </div>;

        var maxError = (i) => <div className="perseus-widget-row">
            <NumberInput label="Max error"
                className="max-error"
                value={answers[i]["maxError"]}
                onChange={this.updateAnswer(i, "maxError")}
                placeholder="0" />
        </div>;


        var inputSize = <div>
                <label>Width:{' '} </label>
                <ButtonGroup value={this.props.size} allowEmpty={false}
                    buttons={[
                        {value: "normal", text: "Normal (80px)"},
                        {value: "small", text: "Small (40px)"}]}
                    onChange={this.change("size")} />
                <InfoTip>
                    <p>Use size "Normal" for all text boxes, unless there are
                    multiple text boxes in one line and the answer area is too
                    narrow to fit them.</p>
                </InfoTip>
            </div>;

        var instructions = {
            "wrong":    "(address the mistake/misconception)",
            "ungraded": "(explain in detail to avoid confusion)",
            "correct":  "(reinforce the user's understanding)"
        };

        var generateInputAnswerEditors = () => answers.map((answer, i) => {
            // TODO(merlob) fix the "0" case in NumberInput and delete this
            var isMaxError = !_([null, 0, "0"]).contains(answer.maxError);
            var editor = Perseus.Editor({
                content: answer.message || "",
                placeholder: "Why is this answer " + answer.status + "?\t" +
                    instructions[answer.status],
                widgetEnabled: false,
                onChange: (newProps) => {
                    if ("content" in newProps) {
                        this.updateAnswer(i, {message: newProps.content});
                    }
                }
            });
            return <div className="perseus-widget-row">
                <div className={"input-answer-editor-value-container" +
                    (isMaxError ? " with-max-error" : "")}>
                    <NumberInput value={answer.value}
                        placeholder="answer"
                        //TODO(merlob) ref={"input_" + i}
                        format={_.last(answer.answerForms)}
                        onChange={(newValue) => {
                            this.updateAnswer(i, {
                                value: numericParse(newValue)
                            });
                        }} />
                    {answer.strict && <div className="is-strict-indicator"
                        title="strictly equivalent to">&equiv;</div>}
                    {answer.simplify !== "required" &&
                     answer.status === "correct" &&
                      <div className={"simplify-indicator " + answer.simplify}
                        title="accepts unsimplified answers">&permil;</div>}
                    {isMaxError && <div className="max-error-container">
                        <div className="max-error-plusmn">&plusmn;</div>
                        <NumberInput placeholder={0}
                            value={answers[i]["maxError"]}
                            format={_.last(answer.answerForms)}
                            onChange={this.updateAnswer(i, "maxError")} />
                    </div>}
                    <div className="value-divider" />
                    <a href="javascript:void(0)"
                      className={"answer-status " + answer.status}
                      onClick={this.onStatusChange.bind(this, i)}>
                        {answer.status}
                    </a>
                    <a href="javascript:void(0)"
                       className="options-toggle"
                       onClick={this.onToggleOptions.bind(this, i)}>
                       <i className="icon-gear" />
                    </a>
                </div>
                <div className="input-answer-editor-message">{editor}</div>
                {this.state.showOptions[i] &&
                    <div className="options-container">
                        {maxError(i)}
                        {answer.status === "correct" && unsimplifiedAnswers(i)}
                        {suggestedAnswerTypes(i)}
                    </div>}
            </div>;
        });

        return <div className="perseus-input-number-editor">
            <div className="ui-title">User input</div>
            <div className="msg-title">Message shown to user on attempt</div>
            {generateInputAnswerEditors()}
            {inputSize}
        </div>;

    },

    focus: function() {
        this.refs["input_0"].getDOMNode().focus();
        return true;
    },

    onToggleOptions: function(choiceIndex) {
        var showOptions = this.state.showOptions.slice();
        showOptions[choiceIndex] = !showOptions[choiceIndex];
        this.setState({showOptions: showOptions});
    },

    onStatusChange: function(choiceIndex) {
        var statuses = ["wrong", "ungraded", "correct"];
        var answers = this.state.answers.slice();
        var i = _.indexOf(statuses, answers[choiceIndex].status);
        var newStatus = statuses[(i + 1) % 3];

        this.updateAnswer(choiceIndex, {
            status: newStatus,
            simplify: newStatus === "correct" ? "required" : "accepted"
        });
    },

    // Replicates the behavior of the Changeable mixin
    updateAnswerPartial: function(choiceIndex, key, value) {
        if (typeof value === "undefined") {
            return _.partial(this.updateAnswerPartial, choiceIndex, key);
        }
        var update = {};
        update[key] = value;
        this.updateAnswer(choiceIndex, update);
    },

    updateAnswer: function(choiceIndex, update) {
        if (!_.isObject(update)) {
            return this.updateAnswerPartial(choiceIndex, update);
        }
        var answers = this.state.answers.slice();
        answers[choiceIndex] = _.extend({}, answers[choiceIndex], update);
        this.updateAllAnswers(answers);
    },

    updateAllAnswers: function(newAnswers) {
        // Filter out all the empty answers
        var answers = _.filter(newAnswers, (c) => c.value != null ||
                    (c.message != null && c.message !== ""));

        var lastStatus = answers.length !== newAnswers.length ?
            // If the user just changed the status of the last clue, save it
            newAnswers[newAnswers.length - 1].status :
            // Otherwise, newly generated clues will default to wrong
            lastStatus = "wrong";

        this.setState({answers: answers.concat([initAnswer(lastStatus)])});
        var sortedAnswers = ([]).concat(
            _.where(answers, {status: "correct"}),
            _.where(answers, {status: "ungraded"}),
            _.where(answers, {status: "wrong"})
        );
        this.props.onChange({answers: sortedAnswers});
    }
});

Widgets.register("numeric-input", NumericInput);
Widgets.register("numeric-input-editor", NumericInputEditor);
