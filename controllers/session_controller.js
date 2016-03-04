
var userController = require('./user_controller');

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

    var login     = req.body.login;
    var password  = req.body.password;

    userController.autenticar(login, password)
        .then(function(user) {

	        // Crear req.session.user y guardar campos id y username
	        // La sesión se define por la existencia de: req.session.user
	        req.session.user = {id:user.id, username:user.username};

	        res.redirect(redir); // redirección a la raiz
		})
		.catch(function(error) {
            req.flash('error', 'Se ha producido un error: ' + error);
            res.redirect("/session?redir="+redir);  
    });
};


// DELETE /session   -- Destruir sesion 
exports.destroy = function(req, res, next) {

    delete req.session.user;
    
    res.redirect("/session"); // redirect a login
};
