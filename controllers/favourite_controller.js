
var models = require('../models');
var paginate = require('./paginate').paginate;

// GET /users/25/favourites
exports.index = function(req, res, next) {

    req.user.countFavourites()
    .then(function(count) {

        // Paginacion:

        var items_per_page = 6;

        // La pagina a mostrar viene en la query
        var pageno = parseInt(req.query.pageno) || 1;

        // Datos para obtener el rango de datos a buscar en la BBDD.
        var pagination = {
            offset: items_per_page * (pageno - 1),
            limit: items_per_page
        };

        // Crear un string con el HTML que pinta la botonera de paginacion.
        // Lo añado como una variable local de res para que lo pinte el layout de la aplicacion.
        res.locals.paginate_control = paginate(count, items_per_page, pageno, req.url);

        return pagination;
    })
    .then(function(pagination) {

        return req.user.getFavourites({offset: pagination.offset,
                                       limit: pagination.limit,
                                        include: [ models.Attachment ]});
    })
    .then(function(favourites) {

        favourites.forEach(function(favourite) {
            favourite.favourite = true;
        });

        res.render('quizzes/index', {quizzes: favourites,
                                     title: "Mis Preguntas Favoritas"});
    })
    .catch(function(error) {
        next(error);
    });
};



// PUT /users/25/favourites/44
exports.add = function(req, res, next) {

    req.user.addFavourite(req.quiz)
        .then(function() {
            if (req.xhr) {
                res.send(200);
            } else {
                var redir = req.body.redir || '/users/' + req.user.id + '/favourites';
                res.redirect(redir);
            }
        })
        .catch(function(error) {
            next(error);
        });
};


// DELETE /users/25/favourites/44
exports.del = function(req, res, next) {

    req.user.removeFavourite(req.quiz)
        .then(function() {
            if (req.xhr) {
                res.send(200);
            } else {
                var redir = req.body.redir || '/users/' + req.user.id + '/favourites';
                res.redirect(redir);
            }
        })
        .catch(function(error) {
            next(error);
        });
};
