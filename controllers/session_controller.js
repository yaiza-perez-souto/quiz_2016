
var userController = require('./user_controller');


// Configurar Passport

var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;

passport.use(new LocalStrategy(
    function(username, password, done) {

        userController.authenticate(username, password)
            .then(function(user) {
                if (user) {
                    return done(null, user); 
                } else {
                    return done(null,false);        
                } 
            })
            .catch(function(error) {
                return done(error);        
            });
    }
));


// GET /session   -- Formulario de login
exports.new = function(req, res, next) {
    res.render('session/new');
};


// POST /session   -- Crear la sesion si usuario se autentica
exports.create = function(req, res, next) {

    passport.authenticate('local', function(error, user, info) {
        if (error) { 
            req.flash('error', 'Se ha producido un error: ' + error);
            return next(error); 
        }

        if (user) { 
            // Crear req.session.user y guardar campos id y username
            // La sesión se define por la existencia de: req.session.user
            req.session.user = {id:user.id, username:user.username};

            res.redirect("/"); // redirección a la raiz  
        } else {
            req.flash('error', 'La autenticación es incorrecta. Reinténtelo otra vez.');
            res.redirect("/session"); 
        }
    })(req, res, next);
};


// DELETE /session   -- Destruir sesion 
exports.destroy = function(req, res, next) {

    delete req.session.user;
    
    res.redirect("/session"); // redirect a login
};
