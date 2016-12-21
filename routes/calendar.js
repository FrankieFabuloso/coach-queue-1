const express = require('express')
const router = express.Router()
const gcal = require('google-calendar')
const P = require('bluebird')
const gcalP = P.promisifyAll(gcal)
const moment = require('moment')
const {findFreeSchedule, findNextAppointment} = require('../models/appointment')
const {createAppointment} = require('../io/database/appointments')
const {getActiveCoaches} = require('../io/database/users')

router.all('/', (request, response) => {
  const {accessToken} = request.session

  gcal(accessToken).calendarList.list((err, data) =>
    err ? response.send(500, err) : response.json(data)
  )
})

router.all('/init', (request, response) => {
  var options = {
    uri: 'https://www.googleapis.com/oauth2/v3/tokeninfo',
    qs: {
      id_token: '89cf37a725f924ce42131e0aa7523822ca885d30' // -> uri + '?access_token=xxxxx%20xxxxx' 
    },
    headers: {'User-Agent': 'Request-Promise'},
    json: true 
  };
 
  rp(options)
    .then(responses => {
      console.log('Did I get anything?', responses.responses[0].answers);
    })
    .catch(error => console.log(error))
})

router.all('/find_next', (request, response) => {
  //TODO: make sure email and calendar id's fields in DB are filled in on 'onboarding'
  const startOfToday = moment().startOf('day').add({h:9})
  const endOfToday = moment().startOf('day').add({h:17.5})

  let endOfDay = moment() > endOfToday
    ? moment().endOf('day').add({h:17.5, ms:1})
    : endOfToday

  let startOfDay = moment().isBetween(endOfToday, moment().endOf('day'))
    ? moment().endOf('day').add({h:9, ms:1})
    : startOfToday
  const busytimes = []

  getActiveCoaches()
    .then(coachesArray => {
      console.log('coachesArray', coachesArray)
      P.all(coachesArray.map(coach => {
        console.log('coach info', coach)
        console.log('session', request.session)
        // use google access token from db
        const access_token = request.session.access_token
        const google_calendar = gcal(access_token)
        const freeBusyP = P.promisifyAll(google_calendar.freebusy)
        const calendarId = coach.calendar_ids[0]        
        return freeBusyP.queryAsync({
          items: [{id:`${calendarId}`}],
          timeMin: startOfDay,
          timeMax: endOfDay
        })
      }))
      .then(freeBusyTimes => {
        console.log('got values::', freeBusyTimes)
        response.json({a:1})
      })
    })
})


router.all('/:calendarId', (req, res) => {
  const { access_token } = req.session;
  const google_calendar = gcal(access_token)
  const { calendarId } = req.params;
  const endOfToday = moment().startOf('day').add({h:17.5})
  const startOfToday = moment().startOf('day').add({h:9})

  let endOfDay = moment() > endOfToday
    ? moment().endOf('day').add({h:17.5, ms:1})
    : endOfToday

  let startOfDay = moment().isBetween(endOfToday, moment().endOf('day'))
    ? moment().endOf('day').add({h:9, ms:1})
    : startOfToday


  google_calendar.freebusy.query({
    items: [{id:`${calendarId}`}],
    timeMin: startOfDay,
    timeMax: endOfDay
  }, (err, data) => {
    if (err) { return res.send(500, err) }

    let busyTime = data.calendars[calendarId].busy
    console.log(busyTime)
    Promise.resolve(findFreeSchedule(busyTime))
      .then(freeApptTimes => findNextAppointment(freeApptTimes))
      .then( aptData => {
        let aptStart = aptData.start
        let aptEnd = aptData.end
        let event = {
          'summary': 'Coaching session with Somebody',
          'description': 'Go get \'em champ',
          'start': {
            'dateTime': aptStart,
            'timeZone': 'America/Los_Angeles'
          },
          'end': {
            'dateTime': aptEnd,
            'timeZone': 'America/Los_Angeles'
          }
        }
        google_calendar.events.insert(calendarId, event, (err, data) => {
          if (err) { return res.send(500, err) }
          createAppointment({
            appointment_start: data.start.dateTime,
            appointment_end: data.end.dateTime,
            coach_handle: 'imaleafyplant',
            appointment_length: 30,
            description: 'Please help.',
            mentee_handles: [ 'luvlearning', 'cupofjoe', 'codeandstuff' ]
          }).then(databaseData => res.json(databaseData))
      }).catch(err => res.json(err))
    })
  })
})


module.exports = router
