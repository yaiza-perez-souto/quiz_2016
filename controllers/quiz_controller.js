
var models = require('../models');
var Sequelize = require('sequelize');
var cloudinary = require('cloudinary');
var fs = require('fs');
var url = require('url');
var paginate = require('./paginate').paginate;


// Opciones para imagenes subidas a Cloudinary
var cloudinary_image_options = { crop: 'limit', width: 200, height: 200, radius: 5, 
                                 border: "3px_solid_blue", tags: ['core', 'quiz-2016'] };


// Autoload el quiz asociado a :quizId
exports.load = function(req, res, next, quizId) {
	models.Quiz.findById(quizId, { include: [ models.Comment, models.Attachment ] })
  		.then(function(quiz) {
      		if (quiz) {
        		req.quiz = quiz;
        		next();
      		} else { 
      			throw new Error('No existe quizId=' + quizId);
      		}
        })
        .catch(function(error) { next(error); });
};


// MW que permite acciones solamente si al usuario logeado es admin o es el autor del quiz.
exports.ownershipRequired = function(req, res, next){

    var isAdmin      = req.session.user.isAdmin;
    var quizAuthorId = req.quiz.AuthorId;
    var loggedUserId = req.session.user.id;

    if (isAdmin || quizAuthorId === loggedUserId) {
        next();
    } else {
      console.log('Operación prohibida: El usuario logeado no es el autor del quiz, ni un administrador.');
      res.send(403);
    }
};


// GET /quizzes
exports.index = function(req, res, next) {

    var options = {};
    var title = "Preguntas";

    // Solo los Quizzes de un autor.
    if (req.user) {
        options.where = {AuthorId: req.user.id};
        title = "Mis Preguntas";
    }

    models.Quiz.count(options)
    .then(function(count) {

        options.include = [ models.Attachment ];

        // Para usuarios logeados: incluir los fans de las preguntas.
        if (req.session.user) {
            options.include.push({ model: models.User, as: 'Fans' });
        }

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

        options.offset = pagination.offset;
        options.limit  = pagination.limit;

        return models.Quiz.findAll(options);
    })
	.then(function(quizzes) {

        // Para usuarios logeados:
        //   Añado a todos los quizzes un atributo booleano llamado "favourite"
        //   que indica si el quiz es uno de mis favoritos o no. 
        if (req.session.user) {

            quizzes.forEach(function(quiz) {
                quiz.favourite = quiz.Fans.some(function(fan) {
                    return fan.id == req.session.user.id;
                });
            });
        } 

		res.render('quizzes/index.ejs', {quizzes: quizzes,
                                         title: title});
	})
	.catch(function(error) {
		next(error);
	});
};


// GET /quizzes/:quizId
exports.show = function(req, res, next) {

	var answer = req.query.answer || '';

    // Para usuarios logeados:
    //   Si el quiz es uno de mis favoritos, creo un atributo llamado
    //   "favourite" con el valor true.
    if (req.session.user) {

        req.quiz.getFans({where: {id: req.session.user.id}})
            .then(function(fans) {
                if (fans.length > 0) {
                    req.quiz.favourite = true
                }      
            })
            .then(function() {
                res.render('quizzes/show', { quiz: req.quiz,
                                             answer: answer});
            })
            .catch(function(error){
                next(error);
            });
    } else {
        res.render('quizzes/show', {quiz: req.quiz,
                                    answer: answer});
    }
};


// GET /quizzes/:quizId/check
exports.check = function(req, res, next) {

	var answer = req.query.answer || "";

	var result = answer === req.quiz.answer ? 'Correcta' : 'Incorrecta';

	res.render('quizzes/result', { quiz: req.quiz, 
								   result: result, 
								   answer: answer });
};


// GET /quizzes/new
exports.new = function(req, res, next) {

    // URL al que volver despues de crear un nuevo quiz.  
    var redir = req.query.redir || 
                url.parse(req.headers.referer || "/quizzes").pathname;

    var quiz = models.Quiz.build({question: "", answer: ""});
    res.render('quizzes/new', {quiz: quiz,
                               redir: redir});
};


// POST /quizzes/create
exports.create = function(req, res, next) {

    var redir = req.body.redir || '/quizzes'

    var authorId = req.session.user && req.session.user.id || 0;
    var quiz = { question: req.body.question, 
                 answer:   req.body.answer,
                 AuthorId: authorId };

    // Guarda en la tabla Quizzes el nuevo quiz.
    models.Quiz.create(quiz)
    .then(function(quiz) {
        req.flash('success', 'Pregunta y Respuesta guardadas con éxito.');

        if (!req.file) { 
            req.flash('info', 'Es un Quiz sin imagen.');
            return; 
        }    

        // Salvar la imagen en Cloudinary
        return uploadResourceToCloudinary(req)
        .then(function(uploadResult) {
            // Crear nuevo attachment en la BBDD.
            return createAttachment(req, uploadResult, quiz);
        });
    })
    .then(function() {
        res.redirect(redir);
    })
    .catch(Sequelize.ValidationError, function(error) {
        req.flash('error', 'Errores en el formulario:');
        for (var i in error.errors) {
            req.flash('error', error.errors[i].value);
        };
  
        res.render('quizzes/new', {quiz: quiz,
                                   redir: redir});
    })
    .catch(function(error) {
        req.flash('error', 'Error al crear un Quiz: '+error.message);
        next(error);
    }); 
};


// GET /quizzes/:quizId/edit
exports.edit = function(req, res, next) {

    // URL al que volver despues de editar el quiz.  
    var redir = req.query.redir || 
                url.parse(req.headers.referer || "/quizzes").pathname;

    var quiz = req.quiz;  // req.quiz: autoload de instancia de quiz

    res.render('quizzes/edit', {quiz: quiz,
                                redir: redir});
};



// PUT /quizzes/:quizId
exports.update = function(req, res, next) {

    var redir = req.body.redir || '/quizzes'

    req.quiz.question = req.body.question;
    req.quiz.answer   = req.body.answer;

    req.quiz.save({fields: ["question", "answer"]})
    .then(function(quiz) {

        req.flash('success', 'Pregunta y Respuesta editadas con éxito.');

        // Sin imagen: Eliminar attachment e imagen viejos.
        if (!req.file) { 
            req.flash('info', 'Tenemos un Quiz sin imagen.');
            if (quiz.Attachment) {
                cloudinary.api.delete_resources(quiz.Attachment.public_id);
                return quiz.Attachment.destroy();
            }
            return; 
        }  

        // Salvar la imagen nueva en Cloudinary
        return uploadResourceToCloudinary(req)
        .then(function(uploadResult) {
            // Actualizar el attachment en la BBDD.
            return updateAttachment(req, uploadResult, quiz);
        });
    })            
    .then(function() {
        res.redirect(redir);
    })
    .catch(Sequelize.ValidationError, function(error) {

      req.flash('error', 'Errores en el formulario:');
      for (var i in error.errors) {
          req.flash('error', error.errors[i].value);
      };

      res.render('quizzes/edit', {quiz: req.quiz,
                                  redir: redir});
    })
    .catch(function(error) {
      req.flash('error', 'Error al editar el Quiz: '+error.message);
      next(error);
    });
};


// DELETE /quizzes/:quizId
exports.destroy = function(req, res, next) {

    // URL al que volver despues de borrar el quiz.  
    var redir = req.query.redir || 
                url.parse(req.headers.referer || "/quizzes").pathname;

    // Borrar la imagen de Cloudinary (Ignoro resultado)
    if (req.quiz.Attachment) {
        cloudinary.api.delete_resources(req.quiz.Attachment.public_id);
    }

    req.quiz.destroy()
      .then( function() {
  	  req.flash('success', 'Quiz borrado con éxito.');
        res.redirect(redir);
      })
      .catch(function(error){
  	  req.flash('error', 'Error al editar el Quiz: '+error.message);
        next(error);
      });
};

// FUNCIONES AUXILIARES

/**
 * Crea una promesa para crear un attachment en la tabla Attachments.
 */
function createAttachment(req, uploadResult, quiz) {
    if (!uploadResult) {
        return Promise.resolve();
    }

    return models.Attachment.create({ public_id: uploadResult.public_id,
                                      url: uploadResult.url,
                                      filename: req.file.originalname,
                                      mime: req.file.mimetype,
                                      QuizId: quiz.id })
    .then(function(attachment) {
        req.flash('success', 'Imagen nueva guardada con éxito.');
    })
    .catch(function(error) { // Ignoro errores de validacion en imagenes
        req.flash('error', 'No se ha podido salvar la nueva imagen: '+error.message);
        cloudinary.api.delete_resources(uploadResult.public_id);
    });
}


/**
 * Crea una promesa para actualizar un attachment en la tabla Attachments.
 */
function updateAttachment(req, uploadResult, quiz) {
    if (!uploadResult) {
        return Promise.resolve();
    }

    // Recordar public_id de la imagen antigua.
    var old_public_id = quiz.Attachment ? quiz.Attachment.public_id : null;

    return quiz.getAttachment()
    .then(function(attachment) {
        if (!attachment) {
            attachment = models.Attachment.build({ QuizId: quiz.id });
        }
        attachment.public_id = uploadResult.public_id;
        attachment.url = uploadResult.url;
        attachment.filename = req.file.originalname;
        attachment.mime = req.file.mimetype;
        return attachment.save();
    })
    .then(function(attachment) {
        req.flash('success', 'Imagen nueva guardada con éxito.');
        if (old_public_id) {
            cloudinary.api.delete_resources(old_public_id);
        }
    })
    .catch(function(error) { // Ignoro errores de validacion en imagenes
        req.flash('error', 'No se ha podido salvar la nueva imagen: '+error.message);
        cloudinary.api.delete_resources(uploadResult.public_id);
    });
}


/**
 * Crea una promesa para subir una imagen nueva a Cloudinary. 
 * Tambien borra la imagen original.
 * 
 * Si puede subir la imagen la promesa se satisface y devuelve el public_id y 
 * la url del recurso subido. 
 * Si no puede subir la imagen, la promesa tambien se cumple pero devuelve null.
 *
 * @return Devuelve una Promesa. 
 */
function uploadResourceToCloudinary(req) {
    return new Promise(function(resolve,reject) {
        var path = req.file.path;
        cloudinary.uploader.upload(path, function(result) {
                fs.unlink(path); // borrar la imagen subida a ./uploads
                if (! result.error) {
                    resolve({ public_id: result.public_id, url: result.secure_url });
                } else {
                    req.flash('error', 'No se ha podido salvar la nueva imagen: '+result.error.message);
                    resolve(null);
                }
            },
            cloudinary_image_options
        );
    })
}

        


