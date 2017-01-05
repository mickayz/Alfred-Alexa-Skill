var APP_ID = "amzn1.ask.skill.d0958c4b-f4fe-4036-914d-7903341dc994";

var FB = require('fbgraph');
var fs = require('fs');
const spawn = require('child_process').spawn;

/**
 * The AlexaSkill prototype and helper functions
 */
var AlexaSkill = require('./AlexaSkill');


var MySkill = function () {
    AlexaSkill.call(this, APP_ID);
};

// Extend AlexaSkill
MySkill.prototype = Object.create(AlexaSkill.prototype);
MySkill.prototype.constructor = MySkill;

MySkill.prototype.eventHandlers.onSessionStarted = function (sessionStartedRequest, session) {
    console.log("MySkill onSessionStarted requestId: " + sessionStartedRequest.requestId
        + ", sessionId: " + session.sessionId);
    accessToken = session.user.accessToken;
    if (accessToken) {
	FB.setAccessToken(accessToken);
	console.log("Access Token : "+accessToken);
    }
    else{
	console.log("NO ACCESS TOKEN!");
    }
};

MySkill.prototype.eventHandlers.onLaunch = function (launchRequest, session, response) {
    console.log("MySkill onLaunch requestId: " + launchRequest.requestId + ", sessionId: " + session.sessionId);
    var whatIDo = "You can ask me to test your Internet speeds, read your upcoming facebook events, or reboot your Raspberry Pi.";
    var speechOutput = "Hello, I'm Alfred.  "+whatIDo;
    var repromptText = whatIDo;
    response.ask(speechOutput, repromptText);
};

MySkill.prototype.eventHandlers.onSessionEnded = function (sessionEndedRequest, session) {
    console.log("MySkill onSessionEnded requestId: " + sessionEndedRequest.requestId
        + ", sessionId: " + session.sessionId);
};

var getspeed = function (data) {
	datastr = data.toString();
	split = datastr.split(",");
	if (split.length === 9){
		down = split[7];
		down = parseFloat(down)/1000000;
		down = down.toFixed(1);
		return down+" mega bits per second.";
	}
	else{
		return "Unknown";
	}

}


var getFirstSundayOfWeek = function (year,week){ 
	// TODO handle when the first day of the year is not a sunday;	
	var date = new Date(year);
	var count = 7*(parseInt(week.replace("W",""))-1);
	date.setDate(date.getDate()+count);
	return date;
}

var getFirstThursdayOfWeek = function(year, week){
	var date = getFirstSundayOfWeek(year, week);
	date.setDate(date.getDate()+4);
	return date;
}

var tempfile = "/tmp/alexaskilltemp";

MySkill.prototype.intentHandlers = {
    // register custom intent handlers

    "Start": function (intent, session, response) {
	session.attributes["skill"] = "speedtest";
        const fast = spawn('speedtest', ['--csv']);
        fast.stdout.on('data', function(data) {
           var stream = fs.createWriteStream(tempfile)
	   speed = getspeed(data);
	   stream.write(speed);
           console.log("Scan complete: "+speed);
	   //session.attributes["speedtest"] = speed;
        })    
        var scanning = "<break time=\"3000ms\" />Scanning...".repeat(4);
        response.ask({"type":"SSML","speech":"<speak>Running Speed Test"+scanning+"<break time=\"3000ms\" />Would you like to retrieve the results?</speak>"},"Would you like to retrieve the results?");
    },
    "No": function (intent, session, response) {
	response.tell("Ok.");
     },
    "Get": function (intent, session, response) {
	
	var skill = session.attributes["skill"];
	if (skill === "speedtest"){
		fs.readFile(tempfile, "ascii", function (err,data){
            		if (err || data === ""){
                		response.ask("Results are not yet ready. Would you like to retrieve the results?", "Would you like to retrieve the results?");
            		}	
            		else{
                		speed = data;
                		response.tellWithCard("You're internet is running at "+speed, "Speed Test", speed+" Mbs.");
                		fs.unlink(tempfile, function (err,data){
                    			if (err){
                        			console.log("Error: File could not be deleted after speed retrieved");
                    			}
                    			else{
                        			console.log("File deleted after speed retrieved");
                    			}

                		})
            		}
        	})
	}
	else if(skill === "reboot"){
		response.tell("Rebooting");
        	spawn("reboot");	
	}
	else {
                response.tell("Error");
	}

    },
    "Reboot": function (intent, session, response) {
	session.attributes["skill"] = "reboot";
	response.ask("Would you like to reboot your device?");
    },

    "FBEvents": function (intent, session, response) {

	var day = intent.slots.day;
	var from;
	var to;
	var date;
	var qDays = 30;
	var maxEvents = 5;
	
	var respIntro = "Here are your upcoming events on facebook. "; 
	if (day && day.value){
		console.log(day.value);
		
		//
		// Handle special values
		// 
		dashes = day.value.split("-");
		
		if ( dashes.length === 2){
			if (dashes[1].indexOf("W")>=0){
				// 01-W02
				qDays = 7;	
				date = getFirstSundayOfWeek(dashes[0],dashes[1]); 
			}
			else{
				//17-01
				maxEvents=15;
				qDays = 30;	
				date = new Date(day.value);
			}
		}
		else if ( dashes.length === 3){
			if (dashes[2].indexOf("WE")>=0){
				// 01-W06-WE
				qDays=4;
				maxEvents=15;
				date = getFirstThursdayOfWeek(dashes[0],dashes[1]);
			} 
			else{
				//17-01-12
				maxEvents=15;
				qDays = 1;
				date = new Date(day.value);
			}
		}

		date.setHours(date.getHours()+12);
		console.log("REQUESTED: "+date+" - "+qDays+" days.");
		from = Math.floor(date/1000);
		date.setDate(date.getDate()+qDays);
		to = Math.floor(date/1000);
		respIntro = ""; 
	}
	else{

		from = Math.floor(Date.now()/1000);
		to = new Date();
		to.setDate(to.getDate()+qDays);
		to = Math.floor(to/1000);
	}		


	//FB.get("me/events?since="+now+"&until="+nextweek, eventsPage);
	//FB.get("me/events?fields=name,start_time.order(reverse_chronological)&since="+Math.floor(Date.now()/1000), eventsPage);

	console.log("FB Events from "+from+" to "+to);
	FB.get("me/events?since="+from+"&until="+to, 
		eventPage=function(err,res){
			curlist = res.data.reverse();
			respStr = "";
			for (var i=0; i<maxEvents&&i<curlist.length; i++){
				event = curlist[i];
				date = new Date(event.start_time);
				date.setHours(date.getHours()-8);
				dateStr = "On "+weekday[date.getUTCDay()]+", "+month[date.getUTCMonth()]+" "+date.getUTCDate();
				//dateStr += " at "+date.getUTCHours()+":"+date.getUTCMinutes();
				nextStr = dateStr + " is "+event.name+". ";
				console.log(nextStr);
				respStr += nextStr;
			}
			if (respStr === ""){
				respIntro = "There are no events for that date."
			}
			response.tell(respIntro + respStr);
		});

    }
};

var weekday = new Array(7);
weekday[0] =  "Sunday";
weekday[1] = "Monday";
weekday[2] = "Tuesday";
weekday[3] = "Wednesday";
weekday[4] = "Thursday";
weekday[5] = "Friday";
weekday[6] = "Saturday";

var month = new Array(12);
month[0] = "January";
month[1] = "February";
month[2] = "March";
month[3] = "April";
month[4] = "May";
month[5] = "June";
month[6] = "July";
month[7] = "August";
month[8] = "September";
month[9] = "October";
month[10] = "November";
month[11] = "December";

/*
var eventsPage = function(err, res){
	curlist = res.data.reverse();
	if (res.paging && res.paging.next){
		FB.get(res.paging.next, eventsPage);
	}
	handleEvents(curlist);
}
*/

// Create the handler that responds to the Alexa Request.
exports.handler = function (event, context) {
    // Create an instance of the MySkill skill.
    var mySkill = new MySkill();
    mySkill.execute(event, context);
};

