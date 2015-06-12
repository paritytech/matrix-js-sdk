"use strict";
/**
 * @module models/room-state
 */
var EventEmitter = require("events").EventEmitter;

var utils = require("../utils");
var RoomMember = require("./room-member");

/**
 * Construct room state.
 * @constructor
 * @param {string} roomId Required. The ID of the room which has this state.
 * @prop {Object.<string, RoomMember>} members The room member dictionary, keyed
 * on the user's ID.
 * @prop {Object.<string, Object.<string, MatrixEvent>>} events The state
 * events dictionary, keyed on the event type and then the state_key value.
 * @prop {string} paginationToken The pagination token for this state.
 */
function RoomState(roomId) {
    this.roomId = roomId;
    this.members = {
        // userId: RoomMember
    };
    this.events = {
        // eventType: { stateKey: MatrixEvent }
    };
    this.paginationToken = null;
}
utils.inherits(RoomState, EventEmitter);

/**
 * Get all RoomMembers in this room.
 * @return {Array<RoomMember>} A list of RoomMembers.
 */
RoomState.prototype.getMembers = function() {
    return utils.values(this.members);
};

/**
 * Get state events from the state of the room.
 * @param {string} eventType The event type of the state event.
 * @param {string} stateKey Optional. The state_key of the state event. If
 * this is <code>undefined</code> then all matching state events will be
 * returned.
 * @return {MatrixEvent[]|MatrixEvent} A list of events if state_key was
 * <code>undefined</code>, else a single event (or null if no match found).
 */
RoomState.prototype.getStateEvents = function(eventType, stateKey) {
    if (!this.events[eventType]) {
        // no match
        return stateKey === undefined ? [] : null;
    }
    if (stateKey === undefined) { // return all values
        return utils.values(this.events[eventType]);
    }
    var event = this.events[eventType][stateKey];
    return event ? event : null;
};

/**
 * Add an array of one or more state MatrixEvents, overwriting
 * any existing state with the same {type, stateKey} tuple. Will fire
 * "RoomState.events" for every event added. May fire "RoomState.members"
 * if there are <code>m.room.member</code> events.
 * @param {MatrixEvent[]} stateEvents a list of state events for this room.
 * @fires module:client~MatrixClient#event:"RoomState.members"
 * @fires module:client~MatrixClient#event:"RoomState.events"
 */
RoomState.prototype.setStateEvents = function(stateEvents) {
    var self = this;
    utils.forEach(stateEvents, function(event) {
        if (event.getRoomId() !== self.roomId) { return; }
        if (!event.isState()) { return; }

        if (self.events[event.getType()] === undefined) {
            self.events[event.getType()] = {};
        }
        self.events[event.getType()][event.getStateKey()] = event;
        self.emit("RoomState.events", event, self);

        if (event.getType() === "m.room.member") {
            var member = self.members[event.getStateKey()];
            if (!member) {
                member = new RoomMember(event.getRoomId(), event.getStateKey());
                self.emit("RoomState.newMember", event, self, member);
            }
            member.setMembershipEvent(event, self);
            // this member may have a power level already, so set it.
            var pwrLvlEvent = self.getStateEvents("m.room.power_levels", "");
            if (pwrLvlEvent) {
                member.setPowerLevelEvent(pwrLvlEvent);
            }
            self.members[event.getStateKey()] = member;
            self.emit("RoomState.members", event, self, member);
        }
        else if (event.getType() === "m.room.power_levels") {
            var members = utils.values(self.members);
            utils.forEach(members, function(member) {
                member.setPowerLevelEvent(event);
            });
        }
    });
};

/**
 * Set the current typing event for this room.
 * @param {MatrixEvent} event The typing event
 */
RoomState.prototype.setTypingEvent = function(event) {
    utils.forEach(utils.values(this.members), function(member) {
        member.setTypingEvent(event);
    });
};

/**
 * The RoomState class.
 */
module.exports = RoomState;

/**
 * Fires whenever the event dictionary in room state is updated.
 * @event module:client~MatrixClient#"RoomState.events"
 * @param {MatrixEvent} event The matrix event which caused this event to fire.
 * @param {RoomState} state The room state whose RoomState.events dictionary
 * was updated.
 * @example
 * matrixClient.on("RoomState.events", function(event, state){
 *   var newStateEvent = event;
 * });
 */

/**
 * Fires whenever a member in the members dictionary is updated in any way.
 * @event module:client~MatrixClient#"RoomState.members"
 * @param {MatrixEvent} event The matrix event which caused this event to fire.
 * @param {RoomState} state The room state whose RoomState.members dictionary
 * was updated.
 * @param {RoomMember} member The room member that was updated.
 * @example
 * matrixClient.on("RoomState.members", function(event, state, member){
 *   var newMembershipState = member.getMembershipState();
 * });
 */

 /**
 * Fires whenever a member is added to the members dictionary. The RoomMember
 * will not be fully populated yet (e.g. no membership state).
 * @event module:client~MatrixClient#"RoomState.newMember"
 * @param {MatrixEvent} event The matrix event which caused this event to fire.
 * @param {RoomState} state The room state whose RoomState.members dictionary
 * was updated with a new entry.
 * @param {RoomMember} member The room member that was added.
 * @example
 * matrixClient.on("RoomState.newMember", function(event, state, member){
 *   // add event listeners on 'member'
 * });
 */