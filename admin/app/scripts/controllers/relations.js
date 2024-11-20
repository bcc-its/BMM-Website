'use strict';

angular.module('bmmApp')
  .controller('RelationsCtrl', function (
      $scope,
      $rootScope,
      $filter,
      $timeout,
      _api,
      _init
    ) {

    var unknownRelations = [], loaded = false;

    $scope.sortableOptions = {
      axis: 'y',
      handle: '.sort_handle',
      'ui-floating': false
    };

    $scope.recorder = 0;
    $scope.recording = false;
    $scope.recorderReset = function() {
      $scope.recorder = 0;
    };
    $scope.toggleRecord = function() {
      $scope.recording = !$scope.recording;
    };
    $scope.lyricsSearch = "";
    var clock = function() {
      $timeout(function() {
        if ($scope.recording) {
          $scope.$apply(function() {
            $scope.recorder = $scope.recorder+1;
          });
        }
        clock();
      }, 1000);
    };
    clock();

    $scope.rel = {};

    //POSSIBLE RELATIONS

    //type: bible
    //timestamp:
    //book:
    //chapter:
    //verse:

    //type: songbook
    //name:
    //id:

    //type: composer
    //name:

    //type: lyricist
    //name:

    //type: arranger
    //name:

    //type: interpret
    //name:

    var groupBibles = function(array) {
      //Group by timestamp
      var timestamps = {}, bibles = [];
      $.each(array, function() {
        if (typeof this.timestamp!=='undefined') {
          //Create if not exist
          if (typeof timestamps[this.timestamp]==='undefined') {
            timestamps[this.timestamp] = {};
          }
          //Append book to timestamp
          if (typeof this.book!=='undefined') {
            //Create if not exist
            if (typeof timestamps[this.timestamp][this.book]==='undefined') {
              timestamps[this.timestamp][this.book] = {};
            }
            //Append chapter to book
            if (typeof this.chapter!=='undefined') {
              //Create if not exist
              if (typeof timestamps[this.timestamp][this.book][this.chapter]==='undefined') {
                timestamps[this.timestamp][this.book][this.chapter] = [];
              }
              //Append verse to chapter
              if (typeof this.verse!=='undefined') {
                timestamps[this.timestamp][this.book][this.chapter].push(this.verse);
              }
            }
          }
        }
      });

      //Write bible to scope
      $.each(timestamps, function(timestamp) {

        var raw = '', i= 0, ii=0;
        //Each book
        $.each(this, function(book) {

          ii = 0;
          if (i!==0) { raw += ' | '; } //Defines a new book
          raw += _init.bible.shortcodes[book];
          i++;

          //Each chapter
          $.each(this, function(chapter) {

            if (ii!==0) {
              raw += ' &'; //Defines a new chapter
            }

            raw += ' '+chapter;
            ii++;

            //Each verse = []
            $.each(this, function(index) {

              if (index!==0) {
                raw += ' + '+this; //Defines a new verse
              } else {
                raw += ', '+this;
              }

            });
          });
        });

        bibles.push({
          raw: raw,
          time: $filter('_time')(timestamp)
        });
      });

      return bibles;
    };

    var getRelations = function() {
      unknownRelations = [];

      //Important note: objects is defined as: $scope.[type + 's']
      var bibles = [];
      $scope.rel.songbooks = [];
      $scope.rel.composers = [];
      $scope.rel.lyricists = [];
      $scope.rel.arrangers = [];
      $scope.rel.interprets = [];
      $scope.rel.bibles = [];
      $scope.rel.externals = [];
      $scope.rel.lyrics = [];

      $.each($scope.$parent.model.rel, function() {
        if (typeof $scope.rel[this.type+'s']==='undefined') {
          unknownRelations.push(this);
        } else {
          if (this.type==='bible') {
            bibles.push(this);
          } else {
            if (this.type==='songbook') {
              this.timestamp = $filter('_time')(this.timestamp);
            }
            $scope.rel[this.type+'s'].push(this);
          }
        }
      });

      $scope.rel.bibles = groupBibles(bibles);
    };

    $scope.$watch('$parent.model', function(model) {
      if (typeof model.rel!=='undefined'&&!loaded) {
        getRelations();
        loaded=true;
      }
    }, true);

    var convertTime = function(time) {
      time = time.split(':');
      if (time.length===3) {
        time = (parseInt(time[0],10)*60*60)+(parseInt(time[1])*60)+parseInt(time[2],10);
      } else if (time.length===2) {
        time = (parseInt(time[0],10)*60)+parseInt(time[1],10);
      } else if (time.length===1) {
        time = parseInt(time[0],10);
      }
      return time;
    };

    var ungroupBibles = function(array) {

      var relations = [], book, chapter, time;
      $.each(array, function() {

        //Convert time
        time = convertTime(this.time);

        $.each($filter('_bibleVerse')(this.raw), function() {
          book = this.key;

          $.each(this.chapters, function() {
            chapter = this.number;

            $.each(this.verses, function() {

              relations.push({
                type: 'bible',
                timestamp: time,
                book: book,
                chapter: chapter,
                verse: this
              });

            });
          });
        });
      });

      return relations;
    };

    var unfilterTime = function(array) {
      var newArray = [];
      $.each(array, function() {
        newArray.push({
          type: 'songbook',
          id: this.id,
          name: this.name,
          timestamp: convertTime(this.timestamp)
        });
      });
      return newArray;
    };

    var setRelations = function(rel) {

      var relations = [];

      $.each(ungroupBibles(rel.bibles), function() { relations.push(this); });
      $.each(unfilterTime(rel.songbooks), function() { relations.push(this); });
      $.each(rel.composers, function() { relations.push(this); });
      $.each(rel.lyricists, function() { relations.push(this); });
      $.each(rel.arrangers, function() { relations.push(this); });
      $.each(rel.interprets, function() { relations.push(this); });
      $.each(rel.externals, function() { relations.push(this); });
      $.each(unknownRelations, function() { relations.push(this); });

      $scope.$parent.model.rel = relations;

    };

    $scope.lyrics = {
      searchTerm: '',
      searchResults: [],
      selectedTitle: null
    };

    $scope.$watch('lyrics.searchTerm', function(term) {
      console.log("watch triggered");
      if (term!=='') {
        _api.lyricsSearch(term).done(function(data) {
          $scope.$apply(function() {
            $scope.lyrics.searchResults = data;
          });
        });
      } else {
        $scope.lyrics.searchResults = [];
      }
    });

    $scope.activateLyrics = function(lyrics) {
      console.log("activate", $scope.$parent);
      $scope.$parent.model.lyrics_id = lyrics.id;
      $scope.lyrics.selectedTitle = lyrics.song_title;
    };

    $scope.deleteLyrics = function() {
      $scope.$parent.model.lyrics_id = null;
      $scope.lyrics.selectedTitle = null;
    }

    $scope.addContributor = function(contributor) {
      $scope.createContributor(contributor).then(function(data) {
        $scope.$apply(function() {
          $scope.contributors.interprets = data;
          $scope.contributors.lyricists = data;
          $scope.contributors.arrangers = data;
          $scope.contributors.composers = data;
        });
      });
    };

    $scope.createContributor = function(contributor) {
      var defer = $.Deferred();
      if (contributor!=='') {
        _api.contributorPost({
          type: 'contributor',
          is_visible: true,
          name: contributor,
          cover_upload: null
        }).then(function() {
          $timeout(function() {
            _api.contributorSearchUnpublishedGet(contributor).done(function(data) {
              defer.resolve(data);
            });
          }, 1000);
        });
      } else {
        defer.fail();
      }
      return defer.promise();
    };

    $scope.contributors = {};
    $scope.$watch('contributors.interpret', function(name) {
      if (name!=='') {
        _api.contributorSearchUnpublishedGet(name).done(function(data) {
          $scope.$apply(function() {
            $scope.contributors.interprets = data;
          });
        });
      } else {
        $scope.contributors.interprets = [];
      }
    });
    $scope.$watch('contributors.lyricist', function(name) {
      if (name!=='') {
        _api.contributorSearchUnpublishedGet(name).done(function(data) {
          $scope.$apply(function() {
            $scope.contributors.lyricists = data;
          });
        });
      } else {
        $scope.contributors.lyricists = [];
      }
    });
    $scope.$watch('contributors.arranger', function(name) {
      if (name!=='') {
        _api.contributorSearchUnpublishedGet(name).done(function(data) {
          $scope.$apply(function() {
            $scope.contributors.arrangers = data;
          });
        });
      } else {
        $scope.contributors.arrangers = [];
      }
    });
    $scope.$watch('contributors.composer', function(name) {
      if (name!=='') {
        _api.contributorSearchUnpublishedGet(name).done(function(data) {
          $scope.$apply(function() {
            $scope.contributors.composers = data;
          });
        });
      } else {
        $scope.contributors.composers = [];
      }
    });

    $scope.$watch('rel', function(rel) {
      if (loaded) {
        setRelations(rel);
      }
    }, true);

    $scope.addBibleReference = function() {
      $scope.rel.bibles.splice(0,0, {
        time: $filter('_time')($scope.recorder)
      });
    };

    $scope.addExternalReference = function() {
      $scope.rel.externals.push({
        type: 'external'
      });
    };

    $scope.removeExternalReference = function(externalReference) {
      var externals = $scope.rel.externals;
      var index = externals.indexOf(externalReference);
      externals.splice(index, 1);
    };

    $scope.activateContributor = function(contributor, relation) {
      $scope.rel[relation+'s'].splice(0,0, {
        name: contributor.name,
        type: relation,
        id: contributor.id
      });
    };

    $scope.availableSongbooks = [
      'herrens_veier',
      'mandelblomsten',
      'NHV',
      'NFMB',
      'RB',
      'SOS'
    ];
    $scope.activateSongbook = function(_name) {
      $scope.rel.songbooks.splice(0,0, {
        id: 0,
        name: _name,
        type: 'songbook',
        timestamp: $filter('_time')(0)
      });
    };

    $scope.deleteReference = function(index, relations) {
      if (typeof index!=='undefined') {
        $scope.rel[relations].splice(index,1);
      }
    };
    $scope.loadMetadata=function(songbook) {
      $rootScope.songtreasures = {
        id: songbook.id,
        loading: true
      };

      var convertLanguageToSongtreasure = function(language) {
        if (language === 'nb')
          return 'no';
        if (language === 'zxx')
          return 'no'; // use norwegian title for instrumental songs
        return language;
      }

      var songbookName = songbook.name === 'herrens_veier' ? 'HV' : songbook.name === 'mandelblomsten' ? 'FMB' : songbook.name;
      _api.songMetadataGet(songbookName, songbook.id)
        .fail(function(response) {
          alert('unable to load metadata: ' + response.responseText);
          $rootScope.songtreasures = { };
        })
        .done(function(response) {
          $rootScope.songtreasures.replaceTitles = true;
          $rootScope.songtreasures.replaceLyricist = true;
          $rootScope.songtreasures.replaceComposer = true;
          $rootScope.songtreasures.replaceLyrics = true;

          var data = response.result;
          var model = $scope.$parent.model;


          $rootScope.songtreasures.lyricsAvailable = false;
          $rootScope.songtreasures.lyricsStatus = 'loading';
          _api.songLyricsGet(response.result.id, convertLanguageToSongtreasure(model.original_language))
            .fail(function(response){
              $rootScope.songtreasures.lyricsStatus = 'not available';
            })
            .done(function(response){
              if (response.result.content) {
                $rootScope.songtreasures.lyricsStatus = 'available';
                $rootScope.songtreasures.lyricsAvailable = true;
              }
              else {
                $rootScope.songtreasures.lyricsStatus = 'not available';
              }

            });

          var alternativeContributors = [];
          var melodyOrigin = null;
          var authors = $.grep(data.participants, function(item){return item.type==='author'});
          var composers = $.grep(data.participants, function(item){return item.type==='composer'});
          var ukjent = 'Ukjent';
          $rootScope.songtreasures.titles =
          $.map(model.translations, function(item) {
            return {language: item.language, current: item.title, new: data.name[convertLanguageToSongtreasure(item.language)]};
          });
          if (authors.length > 0)
            $rootScope.songtreasures.newLyricists = $.map(authors, function(author){return author.contributor.name}).join(', ');
          else if (data.type === 'lyrics')
          {
            $rootScope.songtreasures.newLyricists = ukjent;
            alternativeContributors.push({contributor: {name: ukjent}});
          }
          if (composers.length > 0)
            $rootScope.songtreasures.newComposers = $.map(composers, function(composer){return composer.contributor.name}).join(', ');
          else {
            var mOrigin = $.grep(data.origins, function(item){return item.type === 'melody';});
            if (mOrigin.length>0 && mOrigin[0].description.no) {
              melodyOrigin = mOrigin[0].description.no;
              $rootScope.songtreasures.newComposers = melodyOrigin;
              alternativeContributors.push({contributor: {name: melodyOrigin}});
            } else {
              $rootScope.songtreasures.newComposers = ukjent;
              alternativeContributors.push({contributor: {name: ukjent}});
            }
          }
          $rootScope.songtreasures.currentLyricists = $.map($scope.rel.lyricists, function(l){return l.name}).join(', ');
          $rootScope.songtreasures.currentComposers = $.map($scope.rel.composers, function(composer){return composer.name}).join(', ');
          $rootScope.songtreasures.loading = false;

          var contributorsLoaded = false;
          var loadedRelations = [];
          var promises = [];
          var missingContributors = [];
          $.each(composers.concat(authors.concat(alternativeContributors)), function(index, contributor) {
            promises.push(_api.contributorSearchUnpublishedGet(contributor.contributor.name).done(function(list) {
              for(var i = 0; i < list.length; i++) {
                var item = list[i];
                if (item.name === contributor.contributor.name) {
                  loadedRelations[contributor.contributor.name]={
                    id: item.id,
                    name: item.name,
                    type: item.type
                  };
                  return;
                }
              }
              missingContributors.push(contributor.contributor.name);
              console.log('contributor '+contributor.contributor.name+' is missing in BMM');
            }));
          });
          $.when.apply(null, promises).then(function() {
            contributorsLoaded = true;
          });

          $rootScope.songtreasures.replace = function() {
            if (!contributorsLoaded) {
              alert('unable to load contributors');
              return;
            }

            console.log('replace', $rootScope.songtreasures);

            if ($rootScope.songtreasures.replaceTitles) {
              $.each($scope.$parent.model.translations, function (index, item) {
                var newTitle = data.name[convertLanguageToSongtreasure(item.language)];
                if (newTitle !== null && newTitle !== undefined) {
                  item.title = newTitle;
                }
              });
            }
            if ($rootScope.songtreasures.replaceLyrics && $rootScope.songtreasures.lyricsAvailable) {
              $scope.$parent.replaceLyrics = true;
            }

            $rootScope.songtreasures.loading = true;

            var missingPromises = [];
            if (missingContributors.length > 0 && ($rootScope.songtreasures.replaceLyricist || $rootScope.songtreasures.replaceComposer)) {
              $.each(missingContributors, function(index, name) {
                if (loadedRelations[name]!==undefined) {
                  //item has been added in the meantime. Most likely because composer and lyricist have the same person
                  return;
                }

                var defer = $.Deferred();
                missingPromises.push(defer.promise());
                $scope.createContributor(name).then(function(list) {
                  console.log('created a new contributor for '+name);
                  for(var i = 0; i < list.length; i++) {
                    var item = list[i];
                    if (item.name === name) {
                      loadedRelations[name]={
                        id: item.id,
                        name: item.name,
                        type: item.type
                      };
                      defer.resolve();
                      return;
                    }
                  }
                  alert('an unexpected error occurred');
                });
              });
            }

            $.when.apply(null, missingPromises).then(function() {
              if ($rootScope.songtreasures.replaceComposer) {
                if (melodyOrigin !== null)
                  $scope.rel.composers = [$.extend({}, loadedRelations[melodyOrigin], {type: 'composer'})];
                else if (composers.length === 0)
                  $scope.rel.composers = [$.extend({}, loadedRelations[ukjent], {type: 'composer'})];
                else
                  $scope.rel.composers = $.map(composers, function (item) {
                    var relation = loadedRelations[item.contributor.name];
                    return $.extend({}, relation, {type: 'composer'});
                  });
              }
              if ($rootScope.songtreasures.replaceLyricist) {
                if (authors.length === 0 && data.type === 'lyrics')
                  $scope.rel.lyricists = [$.extend({}, loadedRelations[ukjent], {type: 'lyricist'})];
                else
                  $scope.rel.lyricists = $.map(authors, function (item) {
                    var relation = loadedRelations[item.contributor.name];
                    return $.extend({}, relation, {type: 'lyricist'});
                  });
              }
              $rootScope.songtreasures = {};
            });

          }
        });
    }

  });
