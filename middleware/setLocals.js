const db = require( '../database/' )
const { Statistics } = db

const setLocals = (request, response, next) => {
  Statistics.forCoach( request.user.handle )
    .then( statistics => {
      response.locals = {
        user: request.user,
        development: process.env.NODE_ENV === 'development',
        statistics: statistics || { primary: 'N/A', communal: 'N/A' }
      }

      next()

    })
}

module.exports = setLocals