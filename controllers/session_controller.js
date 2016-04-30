
var models = require('../models');
var Sequelize = require('sequelize');

// Middleware: Se requiere hacer login.
//
// Si el usuario ya hizo login anteriormente entonces existira 
// el objeto user en req.session, por lo que continuo con los demas 
// middlewares o rutas.
// Si no existe req.session.user, entonces es que aun no he hecho 
// login, por lo que me redireccionan a una pantalla de login. 
// Guardo en redir cual es mi url para volver automaticamente a 
// esa url despues de hacer login; pero si redir ya existe entonces
// conservo su valor.
// 
exports.loginRequired = function (req, res, next) {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/session?redir=' + (req.param('redir') || req.url));
    }
};

// MW que permite gestionar un usuario solamente si el usuario logeado es:
//   - admin 
//   - o es el usuario a gestionar.
exports.adminOrMyselfRequired = function(req, res, next){

    var isAdmin      = req.session.user.isAdmin;
    var userId       = req.user.id;
    var loggedUserId = req.session.user.id;

    if (isAdmin || userId === loggedUserId) {
        next();
    } else {
      console.log('Ruta prohibida: no es el usuario logeado, ni un administrador.');
      res.send(403);    }
};

// MW que permite gestionar un usuario solamente si el usuario logeado es:
//   - admin
//   - y no es el usuario a gestionar.
exports.adminAndNotMyselfRequired = function(req, res, next){

    var isAdmin      = req.session.user.isAdmin;
    var userId       = req.user.id;
    var loggedUserId = req.session.user.id;

    if (isAdmin || userId === loggedUserId) {
        next();
    } else {
      console.log('Ruta prohibida: no es el usuario logeado, ni un administrador.');
      res.send(403);    }
};


// Configurar Passport

var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;

/*
 * Autenticar un usuario: Comprueba si el usuario esta registrado en users
 *
 * DBusca el usuario con el username dado y comprueba su password.
 * Si la autenticacion es correcta, llama a done(null, user).
 * Si la autenticacion falla, llama a done(null,false).
 * Si hay errores llama a done(error);
 */
passport.use(new LocalStrategy(
    function(username, password, done) {

        models.User.findOne({where: {username: username}})
            .then(function(user) {
                if (user && user.verifyPassword(password)) {
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
//
// Paso como parametro el valor de redir (es una url a la que 
// redirigirme despues de hacer login) que me han puesto en la 
// query (si no existe uso /).
//
exports.new = function(req, res, next) {
    res.render('session/new', { redir: req.query.redir || '/' });
};


// POST /session   -- Crear la sesion si usuario se autentica
exports.create = function(req, res, next) {

    var redir = req.body.redir || '/'

    passport.authenticate('local', function(error, user, info) {
        if (error) { 

            req.flash('error', 'Se ha producido un error: ' + error);
            return next(error); 
        }

        if (user) { 
            // Crear req.session.user y guardar campos id y username
            // La sesión se define por la existencia de: req.session.user
            req.session.user = {id:user.id, username:user.username, isAdmin:user.isAdmin};

            res.redirect(redir); // redirección a la raiz
        } else {
            req.flash('error', 'La autenticación es incorrecta. Reinténtelo otra vez.');
            res.redirect("/session?redir="+redir);  
        }
    })(req, res, next);
};


// DELETE /session   -- Destruir sesion 
exports.destroy = function(req, res, next) {

    delete req.session.user;
    
    res.redirect("/session"); // redirect a login
};
